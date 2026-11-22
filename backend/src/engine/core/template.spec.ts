import { referencedStepIds, resolveTemplates } from './template';

describe('templates', () => {
  const scope = { trigger: { subject: 'Hi', count: 3, nested: { list: ['a', 'b'] } }, steps: { s1: { id: 'X1' } } };

  it('keeps raw types for a single placeholder and interpolates text otherwise', () => {
    expect(resolveTemplates('{{trigger.count}}', scope)).toBe(3);
    expect(resolveTemplates('Re: {{trigger.subject}} ({{steps.s1.id}})', scope)).toBe('Re: Hi (X1)');
    expect(resolveTemplates('{{trigger.nested.list[1]}}', scope)).toBe('b');
    expect(resolveTemplates({ a: ['{{trigger.missing}}'] }, scope)).toEqual({ a: [''] });
  });

  it('blocks prototype access', () => {
    expect(resolveTemplates('{{trigger.__proto__}}', scope)).toBe('');
  });

  it('finds referenced steps', () => {
    expect(referencedStepIds({ x: '{{steps.a.id}} {{trigger.y}}', y: ['{{steps.b}}'] }).sort()).toEqual(['a', 'b']);
  });
});
