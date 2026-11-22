import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleOAuthProvider } from './google-oauth.provider';

describe('GoogleOAuthProvider', () => {
  const config = {
    get: jest.fn((key: string) => ({
      GOOGLE_OAUTH_CLIENT_ID: 'client-id-fixture',
      GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret-fixture',
      GOOGLE_OAUTH_REDIRECT_URI: 'https://api.example.test/connections/google/callback',
    }[key])),
  } as unknown as ConfigService;
  let provider: GoogleOAuthProvider;

  beforeEach(() => { provider = new GoogleOAuthProvider(config); });
  afterEach(() => jest.restoreAllMocks());

  it('requests identity plus the requested app scopes with offline, incremental consent', () => {
    const createUrl = jest.spyOn(OAuth2Client.prototype, 'generateAuthUrl').mockReturnValue('https://accounts.google.test/oauth');
    provider.createAuthorizationUrl('state-fixture', ['https://www.googleapis.com/auth/spreadsheets']);
    expect(createUrl).toHaveBeenCalledWith(expect.objectContaining({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent select_account',
      state: 'state-fixture',
      scope: ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/spreadsheets'],
    }));
  });

  it('falls back to the legacy Gmail client settings', () => {
    const legacy = new GoogleOAuthProvider({
      get: jest.fn((key: string) => ({
        GOOGLE_GMAIL_CLIENT_ID: 'legacy-id', GOOGLE_GMAIL_CLIENT_SECRET: 'legacy-secret',
        GOOGLE_GMAIL_REDIRECT_URI: 'https://api.example.test/connections/gmail/callback',
      }[key])),
    } as unknown as ConfigService);
    expect(legacy.createAuthorizationUrl('state', [])).toContain('client_id=legacy-id');
  });

  it('exchanges a code and reports granted scopes', async () => {
    jest.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({ tokens: {
      access_token: 'access-token-fixture', refresh_token: 'refresh-token-fixture',
      expiry_date: Date.now() + 3_600_000, scope: 'openid email https://www.googleapis.com/auth/drive',
    } } as never);
    const result = await provider.exchangeCode('code');
    expect(result.scopes).toContain('https://www.googleapis.com/auth/drive');
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('does not accept an unverified identity', async () => {
    jest.spyOn(OAuth2Client.prototype, 'request').mockResolvedValue({
      data: { sub: 'sub', email: 'a@example.test', email_verified: false },
    } as never);
    await expect(provider.getAccount('token')).rejects.toThrow('verified account identity');
  });

  it('detects invalid grants', () => {
    expect(provider.isInvalidGrant({ response: { data: { error: 'invalid_grant' } } })).toBe(true);
    expect(provider.isInvalidGrant(new Error('x'))).toBe(false);
  });
});
