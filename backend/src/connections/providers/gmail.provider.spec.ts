import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { OAuth2Client } from 'google-auth-library';
import { GmailProvider } from './gmail.provider';

describe('GmailProvider', () => {
  const config = {
    get: jest.fn((key: string) => ({
      GOOGLE_GMAIL_CLIENT_ID: 'client-id-fixture',
      GOOGLE_GMAIL_CLIENT_SECRET: 'client-secret-fixture',
      GOOGLE_GMAIL_REDIRECT_URI: 'https://api.example.test/connections/gmail/callback',
    }[key])),
  } as unknown as ConfigService;
  let provider: GmailProvider;

  beforeEach(() => { provider = new GmailProvider(config); });
  afterEach(() => jest.restoreAllMocks());

  it('requests only identity and Gmail read-only scopes with offline account selection', () => {
    const createUrl = jest.spyOn(OAuth2Client.prototype, 'generateAuthUrl').mockReturnValue('https://accounts.google.test/oauth');
    expect(provider.createAuthorizationUrl('state-fixture')).toBe('https://accounts.google.test/oauth');
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent select_account',
      state: 'state-fixture',
      scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/gmail.readonly'],
    }));
  });

  it('receives ConfigService when created by Nest dependency injection', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [GmailProvider, { provide: ConfigService, useValue: config }],
    }).compile();

    const injectedProvider = moduleRef.get(GmailProvider);
    expect(injectedProvider.createAuthorizationUrl('state-fixture')).toContain('client_id=client-id-fixture');
    await moduleRef.close();
  });

  it('exchanges an authorization code without exposing credentials in its return shape', async () => {
    jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({ tokens: {
      access_token: 'access-token-fixture', refresh_token: 'refresh-token-fixture',
      expiry_date: Date.now() + 3_600_000,
      scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
    } } as never);
    const result = await provider.exchangeCode('authorization-code-fixture');
    expect(result).toMatchObject({
      accessToken: 'access-token-fixture',
      refreshToken: 'refresh-token-fixture',
      scopes: expect.arrayContaining(['https://www.googleapis.com/auth/gmail.readonly']),
    });
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects an authorization response without the read-only Gmail scope', async () => {
    jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({ tokens: {
      access_token: 'access-token-fixture', expiry_date: Date.now() + 3_600_000, scope: 'openid email profile',
    } } as never);
    await expect(provider.exchangeCode('authorization-code-fixture')).rejects.toThrow('Google did not grant Gmail read-only access');
  });

  it('retrieves and validates a verified Google account identity', async () => {
    const setCredentials = jest.spyOn(OAuth2Client.prototype, 'setCredentials');
    jest.spyOn(OAuth2Client.prototype, 'request').mockResolvedValue({
      data: { sub: 'google-sub-fixture', email: 'gmail@example.test', email_verified: true, name: 'Gmail User' },
    } as never);
    await expect(provider.getAccount('access-token-fixture')).resolves.toEqual({
      externalAccountId: 'google-sub-fixture', email: 'gmail@example.test', displayName: 'Gmail User',
    });
    expect(setCredentials).toHaveBeenCalledWith({ access_token: 'access-token-fixture' });
  });

  it('does not accept an unverified identity', async () => {
    jest.spyOn(OAuth2Client.prototype, 'request').mockResolvedValue({
      data: { sub: 'google-sub-fixture', email: 'gmail@example.test', email_verified: false },
    } as never);
    await expect(provider.getAccount('access-token-fixture')).rejects.toThrow('Google did not return a verified account identity');
  });

  it('refreshes and revokes credentials using the official OAuth client methods', async () => {
    const refresh = jest.spyOn(OAuth2Client.prototype, 'refreshAccessToken').mockResolvedValue({ credentials: {
      access_token: 'new-access-token-fixture', expiry_date: Date.now() + 3_600_000,
    } } as never);
    const revoke = jest.spyOn(OAuth2Client.prototype, 'revokeToken').mockResolvedValue({ data: {} } as never);
    await expect(provider.refreshAccessToken('refresh-token-fixture')).resolves.toMatchObject({ accessToken: 'new-access-token-fixture' });
    await provider.revoke('refresh-token-fixture');
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledTimes(1);
  });
});
