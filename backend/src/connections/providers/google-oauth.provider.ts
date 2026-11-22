import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { OAuthProvider, ProviderAccount, ProviderTokens } from './integration-provider';

const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REQUEST_TIMEOUT_MS = 10_000;
const IDENTITY_SCOPES = ['openid', 'email', 'profile'];

interface GoogleUserInfo { sub?: string; email?: string; email_verified?: boolean; name?: string }

/**
 * One Google OAuth client for every Google app. Apps request their own scopes and
 * Google's incremental authorization merges them into the same account grant.
 */
@Injectable()
export class GoogleOAuthProvider implements OAuthProvider {
  readonly id = 'google';
  readonly name = 'Google';
  /** Older connections were stored under this provider id. */
  readonly aliases = ['gmail'];
  readonly identityScopes = IDENTITY_SCOPES;

  constructor(private readonly config: ConfigService) {}

  createAuthorizationUrl(state: string, scopes: string[]): string {
    return this.client().generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent select_account',
      scope: [...new Set([...IDENTITY_SCOPES, ...scopes])],
      state,
    });
  }

  async exchangeCode(code: string): Promise<ProviderTokens> {
    const { tokens } = await this.client().getToken(code);
    if (!tokens.access_token || !tokens.expiry_date) throw new Error('Google did not return usable authorization credentials');
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date),
      scopes: splitScopes(tokens.scope),
    };
  }

  async getAccount(accessToken: string): Promise<ProviderAccount> {
    const client = this.client();
    client.setCredentials({ access_token: accessToken });
    const response = await client.request<GoogleUserInfo>({ url: USERINFO_URL, timeout: REQUEST_TIMEOUT_MS });
    const account = response.data;
    if (!account.sub || !account.email || account.email_verified !== true) {
      throw new Error('Google did not return a verified account identity');
    }
    return {
      externalAccountId: account.sub,
      email: account.email.trim().toLowerCase(),
      ...(account.name?.trim() ? { displayName: account.name.trim() } : {}),
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<ProviderTokens> {
    const client = this.client();
    client.setCredentials({ refresh_token: refreshToken });
    const { credentials } = await client.refreshAccessToken();
    if (!credentials.access_token || !credentials.expiry_date) throw new Error('Google did not refresh the access token');
    return {
      accessToken: credentials.access_token,
      refreshToken: credentials.refresh_token,
      expiresAt: new Date(credentials.expiry_date),
      scopes: splitScopes(credentials.scope),
    };
  }

  async revoke(refreshToken: string): Promise<void> {
    await this.client().revokeToken(refreshToken);
  }

  isInvalidGrant(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('response' in error)) return false;
    return (error as { response?: { data?: { error?: unknown } } }).response?.data?.error === 'invalid_grant';
  }

  isUnauthorized(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('response' in error)) return false;
    return (error as { response?: { status?: unknown } }).response?.status === 401;
  }

  private client(): OAuth2Client {
    const read = (name: string, legacy: string) => (this.config.get<string>(name) ?? this.config.get<string>(legacy))?.trim();
    const clientId = read('GOOGLE_OAUTH_CLIENT_ID', 'GOOGLE_GMAIL_CLIENT_ID');
    const clientSecret = read('GOOGLE_OAUTH_CLIENT_SECRET', 'GOOGLE_GMAIL_CLIENT_SECRET');
    const redirectUri = read('GOOGLE_OAUTH_REDIRECT_URI', 'GOOGLE_GMAIL_REDIRECT_URI');
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException('Google account connections are not configured');
    }
    return new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri,
      transporterOptions: {
        timeout: REQUEST_TIMEOUT_MS,
        retry: true,
        retryConfig: { retry: 2, retryDelay: 200, retryDelayMultiplier: 2, noResponseRetries: 1 },
      },
    });
  }
}

function splitScopes(scope: string | null | undefined): string[] {
  return scope?.split(/\s+/).filter(Boolean) ?? [];
}
