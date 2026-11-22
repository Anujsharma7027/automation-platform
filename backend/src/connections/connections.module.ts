import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { GoogleOAuthProvider } from './providers/google-oauth.provider';
import { OAUTH_PROVIDERS, OAuthProvider } from './providers/integration-provider';
import { ProviderRegistry } from './provider-registry';
import { ConnectedAccount, ConnectedAccountSchema } from './schemas/connected-account.schema';
import { OAuthState, OAuthStateSchema } from './schemas/oauth-state.schema';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';
import { TokenEncryptionService } from './token-encryption.service';

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
    GoogleOAuthProvider,
    {
      // Register new OAuth providers (Microsoft, Slack, ...) here.
      provide: OAUTH_PROVIDERS,
      useFactory: (google: GoogleOAuthProvider): OAuthProvider[] => [google],
      inject: [GoogleOAuthProvider],
    },
    ProviderRegistry,
    TokenEncryptionService,
    ConnectionsService,
  ],
  exports: [ConnectionsService],
})
export class ConnectionsModule {}
