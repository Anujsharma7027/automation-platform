import {
  ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { ConnectedAccount, ConnectedAccountDocument } from './schemas/connected-account.schema';
import { OAuthState } from './schemas/oauth-state.schema';
import { ProviderRegistry } from './provider-registry';
import { ProviderAccount, ProviderTokens } from './providers/integration-provider';
import { TokenEncryptionService } from './token-encryption.service';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;
const GOOGLE_INVALID_GRANT = 'invalid_grant';

export interface SafeConnection {
  id: string;
  provider: 'gmail';
  accountEmail: string;
  displayName?: string;
  grantedScopes: string[];
  status: string;
  accessTokenExpiresAt: Date;
  lastValidatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);

  constructor(
    @InjectModel(ConnectedAccount.name) private readonly connections: Model<ConnectedAccount>,
    @InjectModel(OAuthState.name) private readonly states: Model<OAuthState>,
    private readonly providers: ProviderRegistry,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
  ) {}

  async beginGmailConnect(userId: string) {
    const provider = this.providers.get('gmail');
    const callbackUrl = this.mobileRedirectUri();
    const state = randomBytes(32).toString('hex');
    const authorizationUrl = provider.createAuthorizationUrl(state);
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    await this.states.create({
      stateHash: hashState(state),
      userId: new Types.ObjectId(userId),
      provider: 'gmail',
      expiresAt,
    });
    return { authorizationUrl, callbackUrl, expiresAt };
  }

  async handleGmailCallback(input: { code?: string; state?: string; error?: string }): Promise<string> {
    if (!input.state || !/^[a-f\d]{64}$/i.test(input.state)) return this.mobileCallbackUrl('failed');
    const state = await this.states.findOneAndDelete({
      stateHash: hashState(input.state),
      provider: 'gmail',
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!state) return this.mobileCallbackUrl('failed');
    if (input.error === 'access_denied') return this.mobileCallbackUrl('cancelled');
    if (input.error || !input.code) return this.mobileCallbackUrl('failed');

    try {
      const provider = this.providers.get('gmail');
      const tokens = await provider.exchangeCode(input.code);
      const account = await provider.getAccount(tokens.accessToken);
      const connection = await this.saveConnection(state.userId.toString(), account, tokens);
      return this.mobileCallbackUrl('connected', connection.id);
    } catch {
      this.logger.warn('Gmail OAuth callback could not be completed');
      return this.mobileCallbackUrl('failed');
    }
  }

  async list(userId: string, provider?: 'gmail'): Promise<SafeConnection[]> {
    const filter = { userId: new Types.ObjectId(userId), ...(provider ? { provider } : {}) };
    const accounts = await this.connections.find(filter).sort({ updatedAt: -1 }).exec();
    return accounts.map(toSafeConnection);
  }

  async get(userId: string, connectionId: string): Promise<SafeConnection> {
    return toSafeConnection(await this.findOwned(userId, connectionId));
  }

  async refresh(userId: string, connectionId: string): Promise<SafeConnection> {
    const connection = await this.findOwned(userId, connectionId, true);
    if (connection.status === 'REVOKED') throw new ConflictException('This Gmail connection was revoked. Reconnect the account.');
    const provider = this.providers.get(connection.provider);
    const refreshToken = this.encryption.decrypt(connection.encryptedRefreshToken);
    let refreshedTokens: ProviderTokens | undefined;
    let accessToken: string;
    let account: ProviderAccount | undefined;

    const accessIsCurrent = connection.accessTokenExpiresAt.getTime() > Date.now() + EXPIRY_SKEW_MS;
    if (accessIsCurrent) {
      accessToken = this.encryption.decrypt(connection.encryptedAccessToken);
      try {
        account = await provider.getAccount(accessToken);
      } catch (error) {
        if (!isUnauthorizedGoogleResponse(error)) throw new ServiceUnavailableException('Gmail could not be checked right now');
        refreshedTokens = await this.refreshTokens(connection, refreshToken, provider);
        accessToken = refreshedTokens.accessToken;
      }
    } else {
      refreshedTokens = await this.refreshTokens(connection, refreshToken, provider);
      accessToken = refreshedTokens.accessToken;
    }

    if (!account || refreshedTokens) {
      try {
        account = await provider.getAccount(accessToken);
      } catch {
        throw new ServiceUnavailableException('Gmail could not be checked right now');
      }
    }
    if (account.externalAccountId !== connection.externalAccountId) {
      await this.connections.updateOne({ _id: connection._id, userId: connection.userId }, { $set: { status: 'ERROR' } }).exec();
      throw new ConflictException('The connected Google account identity changed. Reconnect this account.');
    }

    const updated = await this.connections.findOneAndUpdate(
      { _id: connection._id, userId: connection.userId },
      {
        $set: {
          encryptedAccessToken: this.encryption.encrypt(accessToken),
          ...(refreshedTokens ? { accessTokenExpiresAt: refreshedTokens.expiresAt } : {}),
          ...(refreshedTokens?.refreshToken ? { encryptedRefreshToken: this.encryption.encrypt(refreshedTokens.refreshToken) } : {}),
          ...(refreshedTokens?.scopes.length ? { grantedScopes: refreshedTokens.scopes } : {}),
          accountEmail: account.email,
          ...(account.displayName ? { displayName: account.displayName } : {}),
          status: 'CONNECTED',
          lastValidatedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).exec();
    if (!updated) throw new NotFoundException('Connection not found');
    return toSafeConnection(updated);
  }

  async disconnect(userId: string, connectionId: string) {
    const connection = await this.findOwned(userId, connectionId, true);
    let providerRevoked = false;
    try {
      await this.providers.get(connection.provider).revoke(this.encryption.decrypt(connection.encryptedRefreshToken));
      providerRevoked = true;
    } catch {
      // The local credential is still deleted; callers receive whether Google revocation succeeded.
      this.logger.warn('Google-side revocation failed; the Taskvyn connection was still removed');
    }
    await this.connections.deleteOne({ _id: connection._id, userId: connection.userId }).exec();
    return { id: connection.id, disconnected: true, providerRevoked };
  }

  private async saveConnection(userId: string, account: ProviderAccount, tokens: ProviderTokens): Promise<ConnectedAccountDocument> {
    const filter = {
      userId: new Types.ObjectId(userId),
      provider: 'gmail' as const,
      externalAccountId: account.externalAccountId,
    };
    const existing = await this.connections.findOne(filter).select('+encryptedRefreshToken').exec();
    const refreshToken = tokens.refreshToken?.trim() ||
      (existing?.encryptedRefreshToken ? this.encryption.decrypt(existing.encryptedRefreshToken) : undefined);
    if (!refreshToken) {
      throw new ConflictException('Google did not provide offline access. Reconnect and approve access to keep this Gmail account connected.');
    }
    const set = {
      accountEmail: account.email,
      ...(account.displayName ? { displayName: account.displayName } : {}),
      encryptedAccessToken: this.encryption.encrypt(tokens.accessToken),
      ...(tokens.refreshToken?.trim() ? { encryptedRefreshToken: this.encryption.encrypt(tokens.refreshToken.trim()) } : {}),
      accessTokenExpiresAt: tokens.expiresAt,
      grantedScopes: tokens.scopes,
      status: 'CONNECTED',
      lastValidatedAt: new Date(),
    };
    try {
      const connection = await this.connections.findOneAndUpdate(
        filter,
        { $set: set, $setOnInsert: { ...filter } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      ).exec();
      if (!connection) throw new ServiceUnavailableException('Gmail connection could not be saved');
      return connection as ConnectedAccountDocument;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = await this.connections.findOneAndUpdate(
        filter,
        { $set: set },
        { new: true, runValidators: true },
      ).exec();
      if (!raced) throw new ConflictException('This Gmail account could not be connected');
      return raced as ConnectedAccountDocument;
    }
  }

  private async refreshTokens(
    connection: ConnectedAccountDocument,
    refreshToken: string,
    provider: ReturnType<ProviderRegistry['get']>,
  ): Promise<ProviderTokens> {
    try {
      return await provider.refreshAccessToken(refreshToken);
    } catch (error) {
      if (isInvalidGrant(error)) {
        await this.connections.updateOne({ _id: connection._id, userId: connection.userId }, { $set: { status: 'REVOKED' } }).exec();
        throw new ConflictException('Google authorization was revoked. Reconnect this Gmail account.');
      }
      throw new ServiceUnavailableException('Gmail could not be refreshed right now');
    }
  }

  private async findOwned(userId: string, connectionId: string, includeTokens = false): Promise<ConnectedAccountDocument> {
    if (!isValidObjectId(connectionId)) throw new NotFoundException('Connection not found');
    const query = this.connections.findOne({ _id: connectionId, userId: new Types.ObjectId(userId) });
    if (includeTokens) query.select('+encryptedAccessToken +encryptedRefreshToken');
    const connection = await query.exec();
    if (!connection) throw new NotFoundException('Connection not found');
    return connection as ConnectedAccountDocument;
  }

  private mobileCallbackUrl(status: 'waiting' | 'connected' | 'cancelled' | 'failed', connectionId?: string): string {
    const url = new URL(this.mobileRedirectUri());
    url.searchParams.set('status', status);
    if (connectionId) url.searchParams.set('connectionId', connectionId);
    return url.toString();
  }

  private mobileRedirectUri(): string {
    const redirect = this.config.get<string>('APP_MOBILE_REDIRECT_URI')?.trim();
    if (!redirect) throw new ServiceUnavailableException('Mobile OAuth callback is not configured');
    try {
      return new URL(redirect).toString();
    } catch {
      throw new ServiceUnavailableException('Mobile OAuth callback is not configured');
    }
  }
}

function toSafeConnection(connection: ConnectedAccountDocument): SafeConnection {
  const status = connection.status === 'CONNECTED' && connection.accessTokenExpiresAt.getTime() <= Date.now()
    ? 'EXPIRED'
    : connection.status;
  return {
    id: connection.id,
    provider: connection.provider,
    accountEmail: connection.accountEmail,
    ...(connection.displayName ? { displayName: connection.displayName } : {}),
    grantedScopes: connection.grantedScopes,
    status,
    accessTokenExpiresAt: connection.accessTokenExpiresAt,
    ...(connection.lastValidatedAt ? { lastValidatedAt: connection.lastValidatedAt } : {}),
    createdAt: connection.createdAt,
    updatedAt: connection.updatedAt,
  };
}

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
}

function isInvalidGrant(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) return false;
  const response = (error as { response?: { data?: { error?: unknown } } }).response;
  return response?.data?.error === GOOGLE_INVALID_GRANT;
}

function isUnauthorizedGoogleResponse(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('response' in error)) return false;
  const response = (error as { response?: { status?: unknown } }).response;
  return response?.status === 401;
}
