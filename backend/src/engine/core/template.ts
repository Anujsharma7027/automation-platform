/**
 * Field mapping. Step inputs may reference earlier data with `{{trigger.subject}}` or
 * `{{steps.<stepId>.id}}`. A string that is exactly one placeholder keeps the raw type
 * (number, array, object); otherwise values are interpolated as text.
 */
export interface TemplateScope {
  trigger: Record<string, unknown>;
  steps: Record<string, Record<string, unknown>>;
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}/g;
const SINGLE = /^\{\{\s*([a-zA-Z0-9_.\-[\]]+)\s*\}\}$/;
const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function lookup(scope: TemplateScope, path: string): unknown {
  const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
  let current: unknown = scope;
  for (const segment of segments) {
    if (FORBIDDEN_SEGMENTS.has(segment)) return undefined;
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function stringify(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function resolveTemplates<T>(value: T, scope: TemplateScope): T {
  if (typeof value === 'string') {
    const single = SINGLE.exec(value);
    if (single) return (lookup(scope, single[1]) ?? '') as T;
    return value.replace(PLACEHOLDER, (_, path: string) => stringify(lookup(scope, path))) as T;
  }
  if (Array.isArray(value)) return value.map((item) => resolveTemplates(item, scope)) as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, resolveTemplates(item, scope)]),
    ) as T;
  }
  return value;
}

/** Every `steps.<id>` referenced anywhere in a value. Used to validate step order. */
export function referencedStepIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (item: unknown) => {
    if (typeof item === 'string') {
      for (const match of item.matchAll(PLACEHOLDER)) {
        const [root, id] = match[1].split('.');
        if (root === 'steps' && id) ids.add(id);
      }
    } else if (Array.isArray(item)) item.forEach(visit);
    else if (item && typeof item === 'object') Object.values(item).forEach(visit);
  };
  visit(value);
  return [...ids];
}

export function containsTemplate(value: unknown): boolean {
  return typeof value === 'string' && /\{\{.+?\}\}/.test(value);
}
