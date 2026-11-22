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

export interface IntegrationProvider {
  readonly id: string;
  readonly name: string;
  readonly scopes: readonly string[];
  createAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<ProviderTokens>;
  getAccount(accessToken: string): Promise<ProviderAccount>;
  refreshAccessToken(refreshToken: string): Promise<ProviderTokens>;
  revoke(refreshToken: string): Promise<void>;
}
