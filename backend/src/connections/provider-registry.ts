import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { OAUTH_PROVIDERS, OAuthProvider } from './providers/integration-provider';

@Injectable()
export class ProviderRegistry {
  private readonly providers: ReadonlyMap<string, OAuthProvider>;

  constructor(@Inject(OAUTH_PROVIDERS) providers: OAuthProvider[]) {
    const map = new Map<string, OAuthProvider>();
    for (const provider of providers) {
      for (const id of [provider.id, ...(provider.aliases ?? [])]) map.set(id, provider);
    }
    this.providers = map;
  }

  /** Resolves a provider by id or alias (e.g. legacy `gmail` → `google`). */
  get(providerId: string): OAuthProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new NotFoundException('Integration provider not found');
    return provider;
  }

  /** Canonical id plus aliases, for queries over stored connections. */
  storedIds(providerId: string): string[] {
    const provider = this.get(providerId);
    return [provider.id, ...(provider.aliases ?? [])];
  }

  list() {
    return [...new Set(this.providers.values())].map(({ id, name }) => ({ id, name }));
  }
}
