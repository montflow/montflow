import { test, expect } from 'vitest';
import { Schema } from 'effect';
import {
  PromptFromJson,
  renderPromptTemplate,
  templateUsesVariable,
  type PromptDecoded,
} from '../prompt-schema';

const encode = (prompt: unknown): string =>
  Schema.encodeUnknownSync(PromptFromJson)(prompt as never);

const decode = (json: string): unknown =>
  Schema.decodeUnknownSync(PromptFromJson)(json);

const storedPrompt = (): Record<string, unknown> => ({
  version: 1,
  name: 'security-audit',
  description: 'Audit a set of files for security issues',
  template: 'Audit these files:\n{{files}}\n\nFocus on {{focus}}.',
  variables: [
    { name: 'files', label: 'Files', description: 'Paths to audit', required: true },
    { name: 'focus', label: 'Focus', type: 'textarea', required: false, default: 'auth' },
  ],
});

test('prompt schema: round-trips a stored prompt with variables', () => {
  const json = encode(storedPrompt());
  const decoded = decode(json) as PromptDecoded;
  expect(decoded.version).toBe(1);
  expect(decoded.name).toBe('security-audit');
  expect(decoded.description).toBe('Audit a set of files for security issues');
  expect(decoded.template).toContain('{{files}}');
  expect(decoded.variables).toEqual([
    { name: 'files', label: 'Files', description: 'Paths to audit', required: true },
    { name: 'focus', label: 'Focus', type: 'textarea', required: false, default: 'auth' },
  ]);
});

test('prompt schema: bare prompt (no variables / description) decodes', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'simple',
    template: 'Just do this.',
  });
  const decoded = decode(json) as PromptDecoded;
  expect(decoded.name).toBe('simple');
  expect(decoded.description).toBeUndefined();
  expect(decoded.variables).toBeUndefined();
  expect(decoded.template).toBe('Just do this.');
});

test('prompt schema: round-trips attached skills', () => {
  const prompt = {
    ...storedPrompt(),
    skills: ['security-auditor', 'data-flow'],
  };
  const decoded = decode(encode(prompt)) as PromptDecoded;
  expect(decoded.skills).toEqual(['security-auditor', 'data-flow']);
  // Skills are optional — a prompt without them decodes.
  const bare = decode(encode(storedPrompt())) as PromptDecoded;
  expect(bare.skills).toBeUndefined();
});

test('prompt schema: rejects bad version, missing template, non-JSON, unknown type', () => {
  expect(() => decode(JSON.stringify({ version: 2, name: 'x', template: 't' }))).toThrow();
  expect(() => decode(JSON.stringify({ version: 1, name: 'x' }))).toThrow(); // no template
  expect(() => decode('not json')).toThrow();
});

test('prompt schema: rejects unknown variable type', () => {
  const bad = { ...storedPrompt(), variables: [{ name: 'a', type: 'dropdown' }] };
  expect(() => decode(JSON.stringify(bad))).toThrow();
});

test('prompt schema: encoded JSON keeps template placeholders verbatim', () => {
  const json = encode(storedPrompt());
  expect(json).toContain('{{files}}');
  expect(json).toContain('{{focus}}');
});

test('prompt schema: templateUsesVariable matches {{name}} and {{ name }}', () => {
  const template = 'Audit {{files}} then {{ focus }} and {{files}}.';
  expect(templateUsesVariable(template, 'files')).toBe(true);
  expect(templateUsesVariable(template, 'focus')).toBe(true);
  expect(templateUsesVariable(template, 'missing')).toBe(false);
  // RegExp-special names are escaped, not treated as patterns.
  expect(templateUsesVariable('do {{a.b}}', 'a.b')).toBe(true);
});

// Compile-time check: the decoded types expose the expected fields.
type _PromptCheck = PromptDecoded;

test('prompt schema: renderPromptTemplate substitutes values and keeps blanks', () => {
  const template = 'Audit {{files}} focusing on {{focus}}';
  expect(renderPromptTemplate(template, { files: 'src/a', focus: 'auth' })).toBe(
    'Audit src/a focusing on auth',
  );
  // Missing/blank values stay verbatim so the caller sees what's unfilled.
  expect(renderPromptTemplate(template, { files: 'src/a' })).toBe(
    'Audit src/a focusing on {{focus}}',
  );
  // Tolerates spacing inside the tokens.
  expect(renderPromptTemplate('x {{ focus }} y', { focus: 'auth' })).toBe('x auth y');
});
