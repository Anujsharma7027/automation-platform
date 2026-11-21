import { Injectable, NotFoundException } from '@nestjs/common';
import { IntegrationProvider } from './providers/integration-provider';

@Injectable()
export class ProviderRegistry {
  private readonly providers: ReadonlyMap<string, IntegrationProvider>;

  constructor(providers: IntegrationProvider[]) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
  }

  get(providerId: string): IntegrationProvider {
    const provider = this.providers.get(providerId);
    if (!provider) throw new NotFoundException('Integration provider not found');
    return provider;
  }

  list() {
    return [...this.providers.values()].map(({ id, name, scopes }) => ({ id, name, scopes: [...scopes] }));
  }
}
