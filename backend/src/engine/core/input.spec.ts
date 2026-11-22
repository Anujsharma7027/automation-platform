import { PermanentIntegrationError } from './errors';
import { coerceInput, validateConfiguredInput } from './input';
import { FieldDefinition } from './integration.types';

const fields: FieldDefinition[] = [
  { key: 'to', label: 'To', type: 'email', required: true },
  { key: 'count', label: 'Count', type: 'number' },
  { key: 'tags', label: 'Tags', type: 'string[]' },
  { key: 'mode', label: 'Mode', type: 'select', default: 'a', options: [{ label: 'A', value: 'a' }] },
];

describe('input', () => {
  it('accepts placeholders for required fields at design time', () => {
    expect(validateConfiguredInput(fields, { to: '{{trigger.email}}' })).toEqual([]);
    expect(validateConfiguredInput(fields, { mode: 'z', extra: 1 })).toEqual(
      expect.arrayContaining(['Unknown field "extra"', '"To" is required', '"Mode" has an invalid choice']),
    );
  });

  it('coerces values and applies defaults', () => {
    expect(coerceInput(fields, { to: 'a@b.co', count: '4', tags: 'x, y' })).toEqual({ to: 'a@b.co', count: 4, tags: ['x', 'y'], mode: 'a' });
  });

  it('fails permanently when mapped data is invalid', () => {
    expect(() => coerceInput(fields, { to: '' })).toThrow(PermanentIntegrationError);
    expect(() => coerceInput(fields, { to: 'a@b.co', count: 'abc' })).toThrow('must be a number');
  });
});
