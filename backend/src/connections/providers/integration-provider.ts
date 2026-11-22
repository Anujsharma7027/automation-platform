export interface ProviderTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt: Date;
  scopes: string[];
}

export interface ProviderAccount {
  externalAccountId: string;
  email: string;
  displayName?: string;
}

/**
 * OAuth provider (Google, Microsoft, Slack, ...). One provider serves many apps;
 * apps declare which scopes they need and the provider authorizes them.
 */
export interface OAuthProvider {
  readonly id: string;
  readonly name: string;
  /** Previous ids this provider's connections may be stored under. */
  readonly aliases?: readonly string[];
  /** Scopes always requested (identity). */
  readonly identityScopes: readonly string[];
  createAuthorizationUrl(state: string, scopes: string[]): string;
  exchangeCode(code: string): Promise<ProviderTokens>;
  getAccount(accessToken: string): Promise<ProviderAccount>;
  refreshAccessToken(refreshToken: string): Promise<ProviderTokens>;
  revoke(refreshToken: string): Promise<void>;
  /** The refresh token is permanently invalid (user revoked access). */
  isInvalidGrant(error: unknown): boolean;
  isUnauthorized(error: unknown): boolean;
}

export const OAUTH_PROVIDERS = Symbol('OAUTH_PROVIDERS');
