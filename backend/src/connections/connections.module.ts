import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { GmailProvider } from './providers/gmail.provider';
import { IntegrationProvider } from './providers/integration-provider';
import { ProviderRegistry } from './provider-registry';
import { ConnectedAccount, ConnectedAccountSchema } from './schemas/connected-account.schema';
import { OAuthState, OAuthStateSchema } from './schemas/oauth-state.schema';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { TokenEncryptionService } from './token-encryption.service';

const INTEGRATION_PROVIDERS = 'INTEGRATION_PROVIDERS';

@Module({
  imports: [
    ConfigModule,
    MongooseModule.forFeature([
      { name: ConnectedAccount.name, schema: ConnectedAccountSchema },
      { name: OAuthState.name, schema: OAuthStateSchema },
    ]),
  ],
  controllers: [ConnectionsController],
  providers: [
    GmailProvider,
    {
      provide: INTEGRATION_PROVIDERS,
      useFactory: (gmail: GmailProvider): IntegrationProvider[] => [gmail],
      inject: [GmailProvider],
    },
    {
      provide: ProviderRegistry,
      useFactory: (providers: IntegrationProvider[]) => new ProviderRegistry(providers),
      inject: [INTEGRATION_PROVIDERS],
    },
    TokenEncryptionService,
    ConnectionsService,
  ],
})
export class ConnectionsModule {}
