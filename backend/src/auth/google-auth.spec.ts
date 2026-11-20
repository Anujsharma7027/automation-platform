import { ConflictException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { OAuth2Client } from 'google-auth-library';
import { Model } from 'mongoose';
import { MailService } from '../mail/mail.service';
import { UsersService } from '../users/users.service';
import { EmailOtp } from './schemas/email-otp.schema/email-otp.schema';
import { RefreshSession } from './schemas/refresh-session.schema/refresh-session.schema';
import { AuthService } from './auth.service';

describe('Google authentication', () => {
  const payload = {
    sub: 'google-sub-123', email: 'person@gmail.com', email_verified: true,
    name: 'Google Person', iss: 'https://accounts.google.com',
  };
  let users: Record<string, jest.Mock>;
  let jwt: { signAsync: jest.Mock };
  let sessions: { create: jest.Mock };
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: AuthService;
  let verify: jest.SpyInstance;

  beforeEach(() => {
    users = {
      findByGoogleSub: jest.fn().mockResolvedValue(null),
      findByEmail: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439011' }),
      updateGoogleSignIn: jest.fn().mockResolvedValue({ id: '507f1f77bcf86cd799439011' }),
    };
    jwt = { signAsync: jest.fn().mockResolvedValueOnce('access').mockResolvedValueOnce('refresh') };
    sessions = { create: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn().mockReturnValue('7d'),
      getOrThrow: jest.fn().mockReturnValue('configured-secret'),
    };
    service = new AuthService(
      users as unknown as UsersService,
      {} as MailService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      {} as Model<EmailOtp>,
      sessions as unknown as Model<RefreshSession>,
    );
    verify = jest.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => payload,
    } as never);
  });

  afterEach(() => jest.restoreAllMocks());

  it('requires configured Google client IDs', async () => {
    config.get.mockReturnValueOnce(undefined);
    await expect(service.signinWithGoogle('id-token')).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(verify).not.toHaveBeenCalled();
  });

  it('verifies the ID token audience and creates a verified Google user', async () => {
    config.get.mockReturnValueOnce('web-client,android-client');
    await expect(service.signinWithGoogle('verified-id-token')).resolves.toMatchObject({
      accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer',
    });
    expect(verify).toHaveBeenCalledWith({ idToken: 'verified-id-token', audience: ['web-client', 'android-client'] });
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({
      profile: expect.objectContaining({ name: 'Google Person' }),
      email: 'person@gmail.com', googleSub: 'google-sub-123', provider: 'google',
      emailVerified: true, isEmailVerified: true,
    }));
    expect(users.create.mock.calls[0][0].lastLoginAt).toBeInstanceOf(Date);
    expect(sessions.create).toHaveBeenCalledTimes(1);
  });

  it('updates the same user on repeated Google login by stable subject', async () => {
    users.findByGoogleSub.mockResolvedValueOnce({ id: '507f1f77bcf86cd799439012' });
    users.updateGoogleSignIn.mockResolvedValueOnce({ id: '507f1f77bcf86cd799439012' });
    await service.signinWithGoogle('verified-id-token');
    expect(users.create).not.toHaveBeenCalled();
    expect(users.updateGoogleSignIn).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012', 'google-sub-123', expect.objectContaining({ name: 'Google Person' }),
    );
  });

  it('recovers from a concurrent duplicate insert by finding the existing Google subject', async () => {
    users.create.mockRejectedValueOnce({ code: 11000 });
    users.findByGoogleSub.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: '507f1f77bcf86cd799439012' });
    users.updateGoogleSignIn.mockResolvedValueOnce({ id: '507f1f77bcf86cd799439012' });
    await expect(service.signinWithGoogle('verified-id-token')).resolves.toMatchObject({ accessToken: 'access' });
    expect(users.create).toHaveBeenCalledTimes(1);
    expect(users.updateGoogleSignIn).toHaveBeenCalledWith(
      '507f1f77bcf86cd799439012', 'google-sub-123', expect.objectContaining({ name: 'Google Person' }),
    );
  });

  it('creates a separate user for a different Google subject and email', async () => {
    verify.mockResolvedValueOnce({ getPayload: () => ({ ...payload, sub: 'google-sub-456', email: 'second@gmail.com' }) } as never);
    await service.signinWithGoogle('another-verified-id-token');
    expect(users.create).toHaveBeenCalledWith(expect.objectContaining({ email: 'second@gmail.com', googleSub: 'google-sub-456' }));
  });

  it('rejects invalid Google ID tokens', async () => {
    verify.mockRejectedValueOnce(new Error('invalid token'));
    await expect(service.signinWithGoogle('invalid-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('rejects Google identities whose email is unverified', async () => {
    verify.mockResolvedValueOnce({ getPayload: () => ({ ...payload, email_verified: false }) } as never);
    await expect(service.signinWithGoogle('unverified-id-token')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(users.create).not.toHaveBeenCalled();
  });

  it('does not link an existing account based only on matching email', async () => {
    users.findByEmail.mockResolvedValueOnce({ id: '507f1f77bcf86cd799439012' });
    await expect(service.signinWithGoogle('verified-id-token')).rejects.toBeInstanceOf(ConflictException);
    expect(users.create).not.toHaveBeenCalled();
  });
});
