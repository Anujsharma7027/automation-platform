import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model, Types } from 'mongoose';
import { ConnectionsService } from './connections.service';
import { ProviderRegistry } from './provider-registry';
import { ConnectedAccount } from './schemas/connected-account.schema';
import { OAuthState } from './schemas/oauth-state.schema';
import { TokenEncryptionService } from './token-encryption.service';

const USER_ID = '507f1f77bcf86cd799439011';
const CONNECTION_ID = '507f1f77bcf86cd799439012';
const STATE = 'a'.repeat(64);

function query<T>(result: T) {
  return {
    select: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(result),
  };
}

function connection(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: CONNECTION_ID,
    _id: new Types.ObjectId(CONNECTION_ID),
    userId: new Types.ObjectId(USER_ID),
    provider: 'gmail',
    externalAccountId: 'google-sub-fixture',
    accountEmail: 'gmail@example.test',
    displayName: 'Gmail User',
    encryptedAccessToken: 'enc:access-token-fixture',
    encryptedRefreshToken: 'enc:refresh-token-fixture',
    accessTokenExpiresAt: new Date(Date.now() + 3_600_000),
    grantedScopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
    status: 'CONNECTED',
    lastValidatedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function createHarness() {
  const stateRecord = { userId: new Types.ObjectId(USER_ID) };
  const stateModel = {
    create: jest.fn().mockResolvedValue(undefined),
    findOneAndDelete: jest.fn(() => query(stateRecord)),
  };
  const connectionModel = {
    find: jest.fn(() => query([])),
    findOne: jest.fn(() => query(null)),
    findOneAndUpdate: jest.fn(() => query(connection())),
    updateOne: jest.fn(() => query({ modifiedCount: 1 })),
    deleteOne: jest.fn(() => query({ deletedCount: 1 })),
  };
  const provider = {
    id: 'gmail',
    name: 'Gmail',
    scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
    createAuthorizationUrl: jest.fn().mockReturnValue('https://accounts.google.test/authorize'),
    exchangeCode: jest.fn().mockResolvedValue({
      accessToken: 'access-token-fixture', refreshToken: 'refresh-token-fixture',
      expiresAt: new Date(Date.now() + 3_600_000),
      scopes: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
    }),
    getAccount: jest.fn().mockResolvedValue({
      externalAccountId: 'google-sub-fixture', email: 'gmail@example.test', displayName: 'Gmail User',
    }),
    refreshAccessToken: jest.fn(),
    revoke: jest.fn().mockResolvedValue(undefined),
  };
  const encryption = {
    encrypt: jest.fn((value: string) => `enc:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^enc:/, '')),
  };
  const config = {
    get: jest.fn((key: string) => key === 'APP_MOBILE_REDIRECT_URI' ? 'mobile://oauth/gmail' : undefined),
  };
  const service = new ConnectionsService(
    connectionModel as unknown as Model<ConnectedAccount>,
    stateModel as unknown as Model<OAuthState>,
    { get: jest.fn().mockReturnValue(provider) } as unknown as ProviderRegistry,
    encryption as unknown as TokenEncryptionService,
    config as unknown as ConfigService,
  );
  return { service, stateModel, connectionModel, provider, encryption };
}

describe('ConnectionsService', () => {
  it('creates a hashed, short-lived user-bound Gmail OAuth state', async () => {
    const { service, stateModel, provider } = createHarness();
    const flow = await service.beginGmailConnect(USER_ID);
    expect(flow).toMatchObject({
      authorizationUrl: 'https://accounts.google.test/authorize',
      callbackUrl: 'mobile://oauth/gmail',
    });
    const [state] = stateModel.create.mock.calls[0];
    expect(state.userId.toString()).toBe(USER_ID);
    expect(state.stateHash).toMatch(/^[a-f\d]{64}$/);
    expect(state.stateHash).not.toBe(STATE);
    expect(state.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(provider.createAuthorizationUrl).toHaveBeenCalledWith(expect.stringMatching(/^[a-f\d]{64}$/));
  });

  it('rejects invalid, expired, or replayed state without exchanging a code', async () => {
    const { service, stateModel, provider } = createHarness();
    stateModel.findOneAndDelete.mockImplementation(() => query(null));
    await expect(service.handleGmailCallback({ code: 'code-fixture', state: 'bad-state' }))
      .resolves.toContain('status=failed');
    await expect(service.handleGmailCallback({ code: 'code-fixture', state: STATE }))
      .resolves.toContain('status=failed');
    expect(stateModel.findOneAndDelete.mock.calls[0][0].expiresAt.$gt).toBeInstanceOf(Date);
    expect(provider.exchangeCode).not.toHaveBeenCalled();
  });

  it('saves a connected account and redirects with only safe connection metadata', async () => {
    const { service, connectionModel, provider } = createHarness();
    const redirect = await service.handleGmailCallback({ code: 'authorization-code-fixture', state: STATE });
    expect(redirect).toContain('status=connected');
    expect(redirect).toContain(`connectionId=${CONNECTION_ID}`);
    expect(redirect).not.toContain('access-token-fixture');
    expect(redirect).not.toContain('refresh-token-fixture');
    expect(provider.exchangeCode).toHaveBeenCalledWith('authorization-code-fixture');
    expect(connectionModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Types.ObjectId), provider: 'gmail', externalAccountId: 'google-sub-fixture' }),
      expect.objectContaining({ $set: expect.objectContaining({ status: 'CONNECTED' }) }),
      expect.objectContaining({ upsert: true, new: true }),
    );
    expect(connectionModel.findOneAndUpdate.mock.calls[0][1].$set.encryptedAccessToken).toMatch(/^enc:/);
    expect(connectionModel.findOneAndUpdate.mock.calls[0][1].$set.encryptedRefreshToken).toMatch(/^enc:/);
  });

  it('keeps an existing refresh token when Google omits a replacement', async () => {
    const { service, connectionModel, provider } = createHarness();
    connectionModel.findOne.mockImplementation(() => query(connection()));
    provider.exchangeCode.mockResolvedValueOnce({
      accessToken: 'new-access-token-fixture', refreshToken: null,
      expiresAt: new Date(Date.now() + 3_600_000), scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    await service.handleGmailCallback({ code: 'authorization-code-fixture', state: STATE });
    expect(connectionModel.findOneAndUpdate.mock.calls[0][1].$set.encryptedRefreshToken).toBeUndefined();
    expect(connectionModel.findOneAndUpdate.mock.calls[0][1].$set.encryptedAccessToken).toBe('enc:new-access-token-fixture');
  });

  it('requires offline access for a new account when no refresh token is issued', async () => {
    const { service, connectionModel, provider } = createHarness();
    provider.exchangeCode.mockResolvedValueOnce({
      accessToken: 'access-token-fixture', refreshToken: null,
      expiresAt: new Date(Date.now() + 3_600_000), scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    });
    await expect(service.handleGmailCallback({ code: 'authorization-code-fixture', state: STATE }))
      .resolves.toContain('status=failed');
    expect(connectionModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('validates a current connection and returns no credentials', async () => {
    const { service, connectionModel, provider } = createHarness();
    connectionModel.findOne.mockImplementation(() => query(connection()));
    const result = await service.refresh(USER_ID, CONNECTION_ID);
    expect(provider.getAccount).toHaveBeenCalledTimes(1);
    expect(provider.refreshAccessToken).not.toHaveBeenCalled();
    expect(result).toMatchObject({ provider: 'gmail', accountEmail: 'gmail@example.test', status: 'CONNECTED' });
    expect(result).not.toHaveProperty('encryptedAccessToken');
    expect(result).not.toHaveProperty('encryptedRefreshToken');
    expect(result).not.toHaveProperty('accessToken');
  });

  it('refreshes expired credentials and marks a revoked refresh grant', async () => {
    const { service, connectionModel, provider } = createHarness();
    connectionModel.findOne.mockImplementation(() => query(connection({ accessTokenExpiresAt: new Date(Date.now() - 1000) })));
    provider.refreshAccessToken.mockRejectedValueOnce({ response: { data: { error: 'invalid_grant' } } });
    await expect(service.refresh(USER_ID, CONNECTION_ID)).rejects.toBeInstanceOf(ConflictException);
    expect(provider.refreshAccessToken).toHaveBeenCalledWith('refresh-token-fixture');
    expect(connectionModel.updateOne).toHaveBeenCalledWith(
      expect.objectContaining({ userId: expect.any(Types.ObjectId) }), { $set: { status: 'REVOKED' } },
    );
  });

  it('stores a refreshed access token without clearing an omitted refresh token', async () => {
    const { service, connectionModel, provider } = createHarness();
    const nextExpiry = new Date(Date.now() + 3_600_000);
    connectionModel.findOne.mockImplementation(() => query(connection({ accessTokenExpiresAt: new Date(Date.now() - 1000) })));
    provider.refreshAccessToken.mockResolvedValueOnce({
      accessToken: 'refreshed-access-fixture', refreshToken: null, expiresAt: nextExpiry, scopes: [],
    });
    await service.refresh(USER_ID, CONNECTION_ID);
    const update = connectionModel.findOneAndUpdate.mock.calls[0][1].$set;
    expect(update.encryptedAccessToken).toBe('enc:refreshed-access-fixture');
    expect(update.accessTokenExpiresAt).toEqual(nextExpiry);
    expect(update.encryptedRefreshToken).toBeUndefined();
    expect(provider.getAccount).toHaveBeenCalledWith('refreshed-access-fixture');
  });

  it('prevents access to another user’s connection and revokes on disconnect', async () => {
    const { service, connectionModel, provider } = createHarness();
    connectionModel.findOne.mockImplementationOnce(() => query(null));
    await expect(service.get('507f1f77bcf86cd799439099', CONNECTION_ID)).rejects.toBeInstanceOf(NotFoundException);
    expect(connectionModel.findOne.mock.calls[0][0].userId.toString()).toBe('507f1f77bcf86cd799439099');

    connectionModel.findOne.mockImplementationOnce(() => query(connection()));
    await expect(service.disconnect(USER_ID, CONNECTION_ID)).resolves.toMatchObject({ disconnected: true, providerRevoked: true });
    expect(provider.revoke).toHaveBeenCalledWith('refresh-token-fixture');
    expect(connectionModel.deleteOne).toHaveBeenCalledWith(expect.objectContaining({ userId: expect.any(Types.ObjectId) }));
  });
});
