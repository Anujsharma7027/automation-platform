import { FieldDefinition } from './integration.types';
import { PermanentIntegrationError } from './errors';
import { containsTemplate } from './template';

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
    || (Array.isArray(value) && value.length === 0);
}

/**
 * Static (design-time) validation: required fields must be filled, either with a value
 * or a mapping placeholder. Returns human readable problems.
 */
export function validateConfiguredInput(fields: FieldDefinition[], input: Record<string, unknown>): string[] {
  const problems: string[] = [];
  const known = new Set(fields.map((field) => field.key));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) problems.push(`Unknown field "${key}"`);
  }
  for (const field of fields) {
    const value = input[field.key];
    if (field.required && isEmpty(value)) problems.push(`"${field.label}" is required`);
    if (field.type === 'select' && field.options && !isEmpty(value) && !containsTemplate(value)
      && !field.options.some((option) => option.value === value)) {
      problems.push(`"${field.label}" has an invalid choice`);
    }
  }
  return problems;
}

/** Runtime coercion after placeholders were resolved. Throws a non-retryable error. */
export function coerceInput(fields: FieldDefinition[], raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    let value = raw[field.key];
    if (isEmpty(value)) value = field.default;
    if (isEmpty(value)) {
      if (field.required) throw new PermanentIntegrationError(`"${field.label}" is empty after mapping`);
      continue;
    }
    result[field.key] = coerce(field, value);
  }
  return result;
}

function coerce(field: FieldDefinition, value: unknown): unknown {
  switch (field.type) {
    case 'number': {
      const number = typeof value === 'number' ? value : Number(String(value).trim());
      if (!Number.isFinite(number)) throw new PermanentIntegrationError(`"${field.label}" must be a number`);
      return number;
    }
    case 'boolean':
      if (typeof value === 'boolean') return value;
      return ['true', '1', 'yes', 'on'].includes(String(value).trim().toLowerCase());
    case 'string[]':
      if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
      return String(value).split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    case 'json':
      if (typeof value !== 'string') return value;
      try {
        return JSON.parse(value) as unknown;
      } catch {
        throw new PermanentIntegrationError(`"${field.label}" must be valid JSON`);
      }
    case 'datetime': {
      const date = new Date(String(value));
      if (Number.isNaN(date.getTime())) throw new PermanentIntegrationError(`"${field.label}" must be a date/time`);
      return date.toISOString();
    }
    case 'email': {
      const text = String(value).trim();
      if (!/^[^\s@]+@[^\s@]+$/.test(text.replace(/^.*<(.+)>$/, '$1'))) {
        throw new PermanentIntegrationError(`"${field.label}" must be an email address`);
      }
      return text;
    }
    default:
      return typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  }
}
