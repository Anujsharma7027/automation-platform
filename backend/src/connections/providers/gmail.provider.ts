import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { IntegrationProvider, ProviderAccount, ProviderTokens } from './integration-provider';

const GMAIL_READONLY = 'https://www.googleapis.com/auth/gmail.readonly';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const REQUEST_TIMEOUT_MS = 10_000;

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

@Injectable()
export class GmailProvider implements IntegrationProvider {
  readonly id = 'gmail';
  readonly name = 'Gmail';
  readonly scopes = ['openid', 'email', 'profile', GMAIL_READONLY] as const;

  constructor(private readonly config: ConfigService) {}

  createAuthorizationUrl(state: string): string {
    return this.client().generateAuthUrl({
      access_type: 'offline',
      include_granted_scopes: true,
      prompt: 'consent select_account',
      scope: [...this.scopes],
      state,
    });
  }

  async exchangeCode(code: string): Promise<ProviderTokens> {
    const { tokens } = await this.client().getToken(code);
    if (!tokens.access_token || !tokens.expiry_date) throw new Error('Google did not return usable authorization credentials');
    const scopes = splitScopes(tokens.scope);
    if (!scopes.includes(GMAIL_READONLY)) throw new Error('Google did not grant Gmail read-only access');
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date),
      scopes,
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

  private client(): OAuth2Client {
    const clientId = this.config.get<string>('GOOGLE_GMAIL_CLIENT_ID')?.trim();
    const clientSecret = this.config.get<string>('GOOGLE_GMAIL_CLIENT_SECRET')?.trim();
    const redirectUri = this.config.get<string>('GOOGLE_GMAIL_REDIRECT_URI')?.trim();
    if (!clientId || !clientSecret || !redirectUri) {
      throw new ServiceUnavailableException('Gmail account connections are not configured');
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
