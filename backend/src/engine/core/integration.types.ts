/**
 * Universal integration contract.
 *
 * Every app (Google, Slack, Stripe, an internal HTTP tool, ...) is described by an
 * `AppDefinition`. The engine never contains app-specific code: it only knows how to
 * authenticate a step, poll a trigger, and run an action through these interfaces.
 */

export type FieldType =
  | 'string'
  | 'text'
  | 'email'
  | 'number'
  | 'boolean'
  | 'datetime'
  | 'select'
  | 'string[]'
  | 'json';

export interface FieldOption {
  label: string;
  value: string;
}

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  helpText?: string;
  placeholder?: string;
  default?: unknown;
  /** Static choices for `select` fields. */
  options?: FieldOption[];
  /** Key of an `AppDefinition.optionLoaders` entry that returns choices from the user's account. */
  dynamicOptions?: string;
}

/** Credentials handed to a step. The engine refreshes tokens; apps never see refresh tokens. */
export interface AuthContext {
  readonly connectionId: string;
  readonly accountEmail: string;
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

export interface StepLogger {
  log(message: string): void;
  warn(message: string): void;
}

export interface StepContext<TInput = Record<string, unknown>> {
  auth: AuthContext;
  input: TInput;
  logger: StepLogger;
  /** Stable per run+step. Apps can pass it to APIs that support idempotency keys. */
  idempotencyKey: string;
  /** Polling only: true when the engine already processed this item id (lets triggers skip expensive hydration). */
  isSeen?: (id: string) => boolean;
}

export interface TriggerItem {
  /** Unique, stable id of the event inside the trigger's scope. Used for de-duplication. */
  id: string;
  data: Record<string, unknown>;
}

interface BaseOperation {
  key: string;
  name: string;
  description: string;
  inputFields: FieldDefinition[];
  /** Example output, shown in the builder for field mapping before real data exists. */
  sample: Record<string, unknown>;
}

/**
 * Polling trigger: returns the most recent items (newest first). The engine stores
 * the ids it has already seen, so implementations stay stateless and simple.
 */
export interface PollingTriggerDefinition extends BaseOperation {
  type: 'polling';
  poll(context: StepContext): Promise<TriggerItem[]>;
}

/**
 * Webhook trigger (instant). Declared so future apps (Stripe, GitHub, ...) can plug in;
 * subscribe/unsubscribe register the hook and `parse` turns an inbound request into items.
 */
export interface WebhookTriggerDefinition extends BaseOperation {
  type: 'webhook';
  subscribe(context: StepContext & { webhookUrl: string }): Promise<Record<string, unknown>>;
  unsubscribe(context: StepContext & { subscription: Record<string, unknown> }): Promise<void>;
  parse(request: { headers: Record<string, string>; body: unknown }): Promise<TriggerItem[]>;
}

export type TriggerDefinition = PollingTriggerDefinition | WebhookTriggerDefinition;

export interface ActionDefinition extends BaseOperation {
  run(context: StepContext): Promise<Record<string, unknown>>;
}

export type AppAuthDefinition =
  | { type: 'oauth2'; provider: string; scopes: string[] }
  | { type: 'none' };

export type OptionLoader = (context: Omit<StepContext, 'idempotencyKey'>) => Promise<FieldOption[]>;

export interface AppDefinition {
  key: string;
  name: string;
  description: string;
  /** Iconify icon name used by clients. */
  icon: string;
  category: string;
  auth: AppAuthDefinition;
  triggers: TriggerDefinition[];
  actions: ActionDefinition[];
  optionLoaders?: Record<string, OptionLoader>;
}

export const APP_DEFINITIONS = Symbol('APP_DEFINITIONS');
