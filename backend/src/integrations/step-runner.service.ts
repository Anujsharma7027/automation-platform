import { Injectable, Logger } from '@nestjs/common';
import { ConnectionsService } from '../connections/connections.service';
import { AppRegistry } from '../engine/core/app-registry';
import { AuthRequiredError, PermanentIntegrationError } from '../engine/core/errors';
import { coerceInput } from '../engine/core/input';
import { AppDefinition, AuthContext, FieldOption, StepLogger, TriggerItem } from '../engine/core/integration.types';
import { resolveTemplates, TemplateScope } from '../engine/core/template';

export interface StepRef {
  app: string;
  operation: string;
  connectionId?: string | null;
  input?: Record<string, unknown>;
}

const NO_AUTH: AuthContext = {
  connectionId: '',
  accountEmail: '',
  getAccessToken: () => Promise.reject(new PermanentIntegrationError('This app does not use an account')),
};

/** The only place that invokes app code. Used by the HTTP API (tests) and the workers. */
@Injectable()
export class StepRunner {
  private readonly logger = new Logger(StepRunner.name);

  constructor(private readonly registry: AppRegistry, private readonly connections: ConnectionsService) {}

  async authFor(userId: string, app: AppDefinition, connectionId?: string | null): Promise<AuthContext> {
    if (app.auth.type === 'none') return NO_AUTH;
    if (!connectionId) throw new AuthRequiredError(`Choose a ${app.name} account for this step.`);
    return this.connections.createAuthContext(userId, connectionId, app.auth.provider, app.auth.scopes);
  }

  async poll(userId: string, step: StepRef, isSeen?: (id: string) => boolean): Promise<TriggerItem[]> {
    const { app, trigger } = this.registry.getTrigger(step.app, step.operation);
    if (trigger.type !== 'polling') throw new PermanentIntegrationError(`${trigger.name} is not a polling trigger`);
    const auth = await this.authFor(userId, app, step.connectionId);
    const input = coerceInput(trigger.inputFields, step.input ?? {});
    const items = await trigger.poll({ auth, input, logger: this.stepLogger(app.key, trigger.key), idempotencyKey: 'poll', isSeen });
    return items.filter((item) => typeof item.id === 'string' && item.id.length > 0 && item.id.length <= 512);
  }

  async runAction(userId: string, step: StepRef, scope: TemplateScope, idempotencyKey: string) {
    const { app, action } = this.registry.getAction(step.app, step.operation);
    const auth = await this.authFor(userId, app, step.connectionId);
    const input = coerceInput(action.inputFields, resolveTemplates(step.input ?? {}, scope));
    const output = await action.run({ auth, input, logger: this.stepLogger(app.key, action.key), idempotencyKey });
    return { input, output: output ?? {} };
  }

  async loadOptions(userId: string, appKey: string, loaderKey: string, connectionId: string | undefined, input: Record<string, unknown>): Promise<FieldOption[]> {
    const app = this.registry.getApp(appKey);
    const loader = app.optionLoaders?.[loaderKey];
    if (!loader) throw new PermanentIntegrationError('Unknown option list');
    const auth = await this.authFor(userId, app, connectionId);
    return (await loader({ auth, input, logger: this.stepLogger(app.key, loaderKey) })).slice(0, 500);
  }

  private stepLogger(app: string, operation: string): StepLogger {
    return {
      log: (message) => this.logger.log(`[${app}.${operation}] ${message}`),
      warn: (message) => this.logger.warn(`[${app}.${operation}] ${message}`),
    };
  }
}
