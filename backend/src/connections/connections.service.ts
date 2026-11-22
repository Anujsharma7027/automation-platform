import {
  BadRequestException, ConflictException, Injectable, Logger, NotFoundException, ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash, randomBytes } from 'node:crypto';
import { isValidObjectId, Model, Types } from 'mongoose';
import { AppRegistry } from '../engine/core/app-registry';
import { AuthRequiredError, TransientIntegrationError } from '../engine/core/errors';
import { AuthContext } from '../engine/core/integration.types';
import { ConnectedAccount, ConnectedAccountDocument } from './schemas/connected-account.schema';
import { OAuthState } from './schemas/oauth-state.schema';
import { ProviderRegistry } from './provider-registry';
import { OAuthProvider, ProviderAccount, ProviderTokens } from './providers/integration-provider';
import { TokenEncryptionService } from './token-encryption.service';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const EXPIRY_SKEW_MS = 60 * 1000;

export interface SafeConnection {
  id: string;
  provider: string;
  accountEmail: string;
  displayName?: string;
  grantedScopes: string[];
  /** App keys whose scopes are all granted by this account. */
  authorizedApps: string[];
  status: string;
  accessTokenExpiresAt: Date;
  lastValidatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger(ConnectionsService.name);
  /** De-duplicates concurrent token refreshes for the same connection inside this process. */
  private readonly refreshing = new Map<string, Promise<string>>();

  constructor(
    @InjectModel(ConnectedAccount.name) private readonly connections: Model<ConnectedAccount>,
    @InjectModel(OAuthState.name) private readonly states: Model<OAuthState>,
    private readonly providers: ProviderRegistry,
    private readonly encryption: TokenEncryptionService,
    private readonly config: ConfigService,
    private readonly apps: AppRegistry,
  ) {}

  /** Starts OAuth for one provider, requesting the scopes of the selected apps. */
  async beginConnect(userId: string, providerId: string, requestedApps?: string[]) {
    const provider = this.providers.get(providerId);
    const apps = requestedApps?.length
      ? [...new Set(requestedApps)]
      : providerId !== provider.id ? [providerId] // legacy `/connections/gmail/connect`
        : this.apps.list().filter((app) => app.auth.type === 'oauth2' && app.auth.provider === provider.id).map((app) => app.key);
    let scopes: string[];
    try {
      scopes = this.apps.scopesFor(provider.id, apps);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'Unknown app');
    }
    const callbackUrl = this.mobileRedirectUri();
    const state = randomBytes(32).toString('hex');
    const authorizationUrl = provider.createAuthorizationUrl(state, scopes);
    const expiresAt = new Date(Date.now() + OAUTH_STATE_TTL_MS);
    await this.states.create({
      stateHash: hashState(state),
      userId: new Types.ObjectId(userId),
      provider: provider.id,
      apps,
      expiresAt,
    });
    return { authorizationUrl, callbackUrl, expiresAt, apps };
  }

  async handleCallback(providerId: string, input: { code?: string; state?: string; error?: string }): Promise<string> {
    if (!input.state || !/^[a-f\d]{64}$/i.test(input.state)) return this.mobileCallbackUrl('failed');
    let provider: OAuthProvider;
    try {
      provider = this.providers.get(providerId);
    } catch {
      return this.mobileCallbackUrl('failed');
    }
    const state = await this.states.findOneAndDelete({
      stateHash: hashState(input.state),
      provider: provider.id,
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!state) return this.mobileCallbackUrl('failed');
    if (input.error === 'access_denied') return this.mobileCallbackUrl('cancelled');
    if (input.error || !input.code) return this.mobileCallbackUrl('failed');

    try {
      const tokens = await provider.exchangeCode(input.code);
      const required = this.apps.scopesFor(provider.id, state.apps ?? []);
      const missing = required.filter((scope) => !tokens.scopes.includes(scope));
      if (missing.length) return this.mobileCallbackUrl('missing_permissions');
      const account = await provider.getAccount(tokens.accessToken);
      const connection = await this.saveConnection(provider, state.userId.toString(), account, tokens);
      return this.mobileCallbackUrl('connected', connection.id);
    } catch {
      this.logger.warn(`${provider.name} OAuth callback could not be completed`);
      return this.mobileCallbackUrl('failed');
    }
  }

  async list(userId: string, filter: { provider?: string; app?: string } = {}): Promise<SafeConnection[]> {
    let providerIds: string[] | undefined;
    if (filter.app) {
      const app = this.apps.getApp(filter.app);
      if (app.auth.type !== 'oauth2') return [];
      providerIds = this.providers.storedIds(app.auth.provider);
    } else if (filter.provider) {
      providerIds = this.providers.storedIds(filter.provider);
    }
    const accounts = await this.connections
      .find({ userId: new Types.ObjectId(userId), ...(providerIds ? { provider: { $in: providerIds } } : {}) })
      .sort({ updatedAt: -1 })
      .exec();
    // Accounts missing this app's scopes are still listed so the user can reconnect them;
    // clients use `authorizedApps` to tell which ones are ready.
    return accounts.map((account) => this.toSafeConnection(account));
  }

  async get(userId: string, connectionId: string): Promise<SafeConnection> {
    return this.toSafeConnection(await this.findOwned(userId, connectionId));
  }

  /** Validates a connection against the provider, refreshing tokens when needed. */
  async refresh(userId: string, connectionId: string): Promise<SafeConnection> {
    const connection = await this.findOwned(userId, connectionId, true);
    if (connection.status === 'REVOKED') throw new ConflictException('This connection was revoked. Reconnect the account.');
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
        if (!provider.isUnauthorized(error)) throw new ServiceUnavailableException(`${provider.name} could not be checked right now`);
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
        throw new ServiceUnavailableException(`${provider.name} could not be checked right now`);
      }
    }
    if (!account) throw new ServiceUnavailableException(`${provider.name} could not be checked right now`);
    if (account.externalAccountId !== connection.externalAccountId) {
      await this.connections.updateOne({ _id: connection._id, userId: connection.userId }, { $set: { status: 'ERROR' } }).exec();
      throw new ConflictException('The connected account identity changed. Reconnect this account.');
    }

    const updated = await this.connections.findOneAndUpdate(
      { _id: connection._id, userId: connection.userId },
      {
        $set: {
          ...this.tokenUpdate(accessToken, refreshedTokens),
          accountEmail: account.email,
          ...(account.displayName ? { displayName: account.displayName } : {}),
          status: 'CONNECTED',
          lastValidatedAt: new Date(),
        },
      },
      { new: true, runValidators: true },
    ).exec();
    if (!updated) throw new NotFoundException('Connection not found');
    return this.toSafeConnection(updated);
  }

  async disconnect(userId: string, connectionId: string) {
    const connection = await this.findOwned(userId, connectionId, true);
    let providerRevoked = false;
    try {
      await this.providers.get(connection.provider).revoke(this.encryption.decrypt(connection.encryptedRefreshToken));
      providerRevoked = true;
    } catch {
      // The local credential is still deleted; callers receive whether provider revocation succeeded.
      this.logger.warn('Provider-side revocation failed; the Taskvyn connection was still removed');
    }
    await this.connections.deleteOne({ _id: connection._id, userId: connection.userId }).exec();
    return { id: connection.id, disconnected: true, providerRevoked };
  }

  /**
   * Ensures a connection belongs to the user, is connected, uses the expected provider and
   * grants the scopes. Throws engine errors so callers can surface them consistently.
   */
  async assertUsable(userId: string, connectionId: string, providerId: string, scopes: string[]): Promise<SafeConnection> {
    let connection: ConnectedAccountDocument;
    try {
      connection = await this.findOwned(userId, connectionId);
    } catch {
      throw new AuthRequiredError('The selected account no longer exists. Choose another account.');
    }
    if (!this.providers.storedIds(providerId).includes(connection.provider)) {
      throw new AuthRequiredError('The selected account belongs to a different service.');
    }
    if (connection.status === 'REVOKED' || connection.status === 'ERROR') {
      throw new AuthRequiredError(`${connection.accountEmail} needs to be reconnected.`);
    }
    const missing = scopes.filter((scope) => !connection.grantedScopes.includes(scope));
    if (missing.length) {
      throw new AuthRequiredError(`${connection.accountEmail} has not granted the permissions this app needs. Reconnect it for this app.`);
    }
    return this.toSafeConnection(connection);
  }

  /** Credentials for one engine step. Tokens never leave the backend. */
  async createAuthContext(userId: string, connectionId: string, providerId: string, scopes: string[]): Promise<AuthContext> {
    const safe = await this.assertUsable(userId, connectionId, providerId, scopes);
    return {
      connectionId,
      accountEmail: safe.accountEmail,
      getAccessToken: (options) => this.getAccessToken(userId, connectionId, options?.forceRefresh ?? false),
    };
  }

  private async getAccessToken(userId: string, connectionId: string, forceRefresh: boolean): Promise<string> {
    const connection = await this.findOwned(userId, connectionId, true).catch(() => {
      throw new AuthRequiredError('The selected account no longer exists.');
    });
    if (connection.status === 'REVOKED') throw new AuthRequiredError(`${connection.accountEmail} needs to be reconnected.`);
    if (!forceRefresh && connection.accessTokenExpiresAt.getTime() > Date.now() + EXPIRY_SKEW_MS) {
      return this.encryption.decrypt(connection.encryptedAccessToken);
    }
    const pending = this.refreshing.get(connectionId);
    if (pending) return pending;
    const task = (async () => {
      const provider = this.providers.get(connection.provider);
      let tokens: ProviderTokens;
      try {
        tokens = await provider.refreshAccessToken(this.encryption.decrypt(connection.encryptedRefreshToken));
      } catch (error) {
        if (provider.isInvalidGrant(error)) {
          await this.connections.updateOne({ _id: connection._id, userId: connection.userId }, { $set: { status: 'REVOKED' } }).exec();
          throw new AuthRequiredError(`Access for ${connection.accountEmail} was revoked. Reconnect the account.`);
        }
        throw new TransientIntegrationError(`${provider.name} token refresh failed`);
      }
      await this.connections.updateOne(
        { _id: connection._id, userId: connection.userId },
        { $set: { ...this.tokenUpdate(tokens.accessToken, tokens), status: 'CONNECTED' } },
      ).exec();
      return tokens.accessToken;
    })().finally(() => this.refreshing.delete(connectionId));
    this.refreshing.set(connectionId, task);
    return task;
  }

  private tokenUpdate(accessToken: string, refreshed?: ProviderTokens) {
    return {
      encryptedAccessToken: this.encryption.encrypt(accessToken),
      ...(refreshed ? { accessTokenExpiresAt: refreshed.expiresAt } : {}),
      ...(refreshed?.refreshToken ? { encryptedRefreshToken: this.encryption.encrypt(refreshed.refreshToken) } : {}),
      ...(refreshed?.scopes.length ? { grantedScopes: refreshed.scopes } : {}),
    };
  }

  private async saveConnection(provider: OAuthProvider, userId: string, account: ProviderAccount, tokens: ProviderTokens): Promise<ConnectedAccountDocument> {
    const owner = new Types.ObjectId(userId);
    // Legacy rows may use an alias id; adopt them instead of creating duplicates.
    const existing = await this.connections.findOne({
      userId: owner, provider: { $in: this.providers.storedIds(provider.id) }, externalAccountId: account.externalAccountId,
    }).select('+encryptedRefreshToken').exec();
    const refreshToken = tokens.refreshToken?.trim() ||
      (existing?.encryptedRefreshToken ? this.encryption.decrypt(existing.encryptedRefreshToken) : undefined);
    if (!refreshToken) {
      throw new ConflictException('The provider did not grant offline access. Reconnect and approve access.');
    }
    const grantedScopes = [...new Set([...(existing?.grantedScopes ?? []), ...tokens.scopes])];
    const set = {
      provider: provider.id,
      accountEmail: account.email,
      ...(account.displayName ? { displayName: account.displayName } : {}),
      encryptedAccessToken: this.encryption.encrypt(tokens.accessToken),
      ...(tokens.refreshToken?.trim() ? { encryptedRefreshToken: this.encryption.encrypt(tokens.refreshToken.trim()) } : {}),
      accessTokenExpiresAt: tokens.expiresAt,
      grantedScopes,
      status: 'CONNECTED',
      lastValidatedAt: new Date(),
    };
    const filter = existing
      ? { _id: existing._id, userId: owner }
      : { userId: owner, provider: provider.id, externalAccountId: account.externalAccountId };
    try {
      const connection = await this.connections.findOneAndUpdate(
        filter,
        { $set: set, $setOnInsert: { userId: owner, externalAccountId: account.externalAccountId } },
        { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
      ).exec();
      if (!connection) throw new ServiceUnavailableException('Connection could not be saved');
      return connection as ConnectedAccountDocument;
    } catch (error) {
      if (!isDuplicateKey(error)) throw error;
      const raced = await this.connections.findOneAndUpdate(
        { userId: owner, provider: provider.id, externalAccountId: account.externalAccountId },
        { $set: set },
        { new: true, runValidators: true },
      ).exec();
      if (!raced) throw new ConflictException('This account could not be connected');
      return raced as ConnectedAccountDocument;
    }
  }

  private async refreshTokens(connection: ConnectedAccountDocument, refreshToken: string, provider: OAuthProvider): Promise<ProviderTokens> {
    try {
      return await provider.refreshAccessToken(refreshToken);
    } catch (error) {
      if (provider.isInvalidGrant(error)) {
        await this.connections.updateOne({ _id: connection._id, userId: connection.userId }, { $set: { status: 'REVOKED' } }).exec();
        throw new ConflictException(`${provider.name} authorization was revoked. Reconnect this account.`);
      }
      throw new ServiceUnavailableException(`${provider.name} could not be refreshed right now`);
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

  private toSafeConnection(connection: ConnectedAccountDocument): SafeConnection {
    const status = connection.status === 'CONNECTED' && connection.accessTokenExpiresAt.getTime() <= Date.now()
      ? 'EXPIRED' // Access tokens are refreshed automatically when used; this only informs the UI.
      : connection.status;
    let provider = connection.provider;
    try {
      provider = this.providers.get(connection.provider).id;
    } catch {
      // Unknown provider ids are reported as stored.
    }
    return {
      id: connection.id,
      provider,
      accountEmail: connection.accountEmail,
      ...(connection.displayName ? { displayName: connection.displayName } : {}),
      grantedScopes: connection.grantedScopes,
      authorizedApps: this.apps.authorizedApps(provider, connection.grantedScopes),
      status,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      ...(connection.lastValidatedAt ? { lastValidatedAt: connection.lastValidatedAt } : {}),
      createdAt: connection.createdAt,
      updatedAt: connection.updatedAt,
    };
  }

  private mobileCallbackUrl(status: 'connected' | 'cancelled' | 'failed' | 'missing_permissions', connectionId?: string): string {
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

function hashState(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

function isDuplicateKey(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: number }).code === 11000;
}
