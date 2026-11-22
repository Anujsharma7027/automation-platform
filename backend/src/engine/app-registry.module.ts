import { Global, Module } from '@nestjs/common';
import { INSTALLED_APPS } from './apps';
import { AppRegistry } from './core/app-registry';
import { APP_DEFINITIONS } from './core/integration.types';

@Global()
@Module({
  providers: [{ provide: APP_DEFINITIONS, useValue: INSTALLED_APPS }, AppRegistry],
  exports: [AppRegistry],
})
export class AppRegistryModule {}
