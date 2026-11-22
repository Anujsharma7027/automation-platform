import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  ActionDefinition, APP_DEFINITIONS, AppDefinition, FieldDefinition, TriggerDefinition,
} from './integration.types';

/** Read-only catalog of installed apps. Adding an app = adding one definition to `APP_DEFINITIONS`. */
@Injectable()
export class AppRegistry {
  private readonly apps: ReadonlyMap<string, AppDefinition>;

  constructor(@Inject(APP_DEFINITIONS) apps: AppDefinition[]) {
    const map = new Map<string, AppDefinition>();
    for (const app of apps) {
      if (map.has(app.key)) throw new Error(`Duplicate app key "${app.key}"`);
      assertUnique(app.key, app.triggers.map((trigger) => trigger.key));
      assertUnique(app.key, app.actions.map((action) => action.key));
      map.set(app.key, app);
    }
    this.apps = map;
  }

  list(): AppDefinition[] {
    return [...this.apps.values()];
  }

  getApp(key: string): AppDefinition {
    const app = this.apps.get(key);
    if (!app) throw new NotFoundException(`App "${key}" is not available`);
    return app;
  }

  getTrigger(appKey: string, triggerKey: string): { app: AppDefinition; trigger: TriggerDefinition } {
    const app = this.getApp(appKey);
    const trigger = app.triggers.find((item) => item.key === triggerKey);
    if (!trigger) throw new NotFoundException(`Trigger "${triggerKey}" is not available for ${app.name}`);
    return { app, trigger };
  }

  getAction(appKey: string, actionKey: string): { app: AppDefinition; action: ActionDefinition } {
    const app = this.getApp(appKey);
    const action = app.actions.find((item) => item.key === actionKey);
    if (!action) throw new NotFoundException(`Action "${actionKey}" is not available for ${app.name}`);
    return { app, action };
  }

  /** OAuth scopes needed by the given apps of one provider (for incremental consent). */
  scopesFor(provider: string, appKeys: string[]): string[] {
    const scopes = new Set<string>();
    for (const key of appKeys) {
      const app = this.getApp(key);
      if (app.auth.type !== 'oauth2' || app.auth.provider !== provider) {
        throw new NotFoundException(`App "${key}" does not use ${provider} sign-in`);
      }
      app.auth.scopes.forEach((scope) => scopes.add(scope));
    }
    return [...scopes];
  }

  /** Apps of a provider whose scopes are all granted. */
  authorizedApps(provider: string, grantedScopes: string[]): string[] {
    const granted = new Set(grantedScopes);
    return this.list()
      .filter((app) => app.auth.type === 'oauth2' && app.auth.provider === provider && app.auth.scopes.every((scope) => granted.has(scope)))
      .map((app) => app.key);
  }

  /** Serializable catalog for clients (no functions). */
  catalog() {
    return this.list().map((app) => describeApp(app));
  }
}

function describeApp(app: AppDefinition) {
  const describe = (operation: { key: string; name: string; description: string; inputFields: FieldDefinition[]; sample: Record<string, unknown> }) => ({
    key: operation.key,
    name: operation.name,
    description: operation.description,
    inputFields: operation.inputFields,
    sample: operation.sample,
  });
  return {
    key: app.key,
    name: app.name,
    description: app.description,
    icon: app.icon,
    category: app.category,
    auth: app.auth,
    triggers: app.triggers.map((trigger) => ({ ...describe(trigger), type: trigger.type })),
    actions: app.actions.map(describe),
  };
}

function assertUnique(appKey: string, keys: string[]) {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) throw new Error(`Duplicate operation "${key}" in app "${appKey}"`);
    seen.add(key);
  }
}
