import { test, expect } from 'vitest';

import { parseOptions, tryParseOptions, USAGE } from '../options';

const parse = (args: string): ReturnType<typeof parseOptions> => parseOptions(args);

// ─── command selection ───────────────────────────────────────────────

test('no args resolves to the interactive menu', () => {
  expect(parse('')).toEqual({ kind: 'menu' });
  expect(parse('  ')).toEqual({ kind: 'menu' });
});

test('boolean commands', () => {
  expect(parse('--list').kind).toBe('list');
  expect(parse('--ls').kind).toBe('list');
  expect(parse('--template').kind).toBe('template');
  expect(parse('--help').kind).toBe('help');
});

test('value commands in both forms', () => {
  expect(parse('--show code-reviewer')).toEqual({ kind: 'show', name: 'code-reviewer' });
  expect(parse('--show=code-reviewer')).toEqual({ kind: 'show', name: 'code-reviewer' });
  expect(parse('--edit x')).toEqual({ kind: 'edit', name: 'x' });
  expect(parse('--modify x')).toEqual({ kind: 'edit', name: 'x' });
  expect(parse('--modify=x')).toEqual({ kind: 'edit', name: 'x' });
  expect(parse('--delete=x')).toEqual({ kind: 'delete', name: 'x', force: false });
});

test('--force sets delete force', () => {
  expect(parse('--delete x --force')).toEqual({ kind: 'delete', name: 'x', force: true });
  expect(parse('--delete x --force=true')).toEqual({ kind: 'delete', name: 'x', force: true });
});

// ─── new command fields ──────────────────────────────────────────────

test('--new collects fields', () => {
  const command = parse(
    '--new --name code-reviewer --description "You are a reviewer" --model anthropic/claude-sonnet-4-5 --skills adversarial-review,unit-testing --checklist "no holes|tests updated"',
  );
  expect(command.kind).toBe('new');
  if (command.kind !== 'new') return;
  expect(command.fields.name).toBe('code-reviewer');
  expect(command.fields.description).toBe('You are a reviewer');
  expect(command.fields.model).toBe('anthropic/claude-sonnet-4-5');
  expect(command.fields.skills).toEqual(['adversarial-review', 'unit-testing']);
  expect(command.fields.checklist).toEqual(['no holes', 'tests updated']);
  expect(command.force).toBe(false);
});

test('--new --force flag', () => {
  const command = parse('--new --name a --description b --force');
  expect(command.kind).toBe('new');
  if (command.kind !== 'new') return;
  expect(command.force).toBe(true);
});

// ─── error handling ──────────────────────────────────────────────────

test('unknown flags throw', () => {
  expect(() => parse('--bogus')).toThrow(/Unknown flag/);
});

test('value flags without values throw', () => {
  expect(() => parse('--show')).toThrow(/expects a value/);
  expect(() => parse('--show --list')).toThrow(/expects a value/);
});

test('conflicting commands throw', () => {
  expect(() => parse('--list --new --name a --description b')).toThrow(/Conflicting commands/);
});

test('tryParseOptions captures errors without throwing', () => {
  const ok = tryParseOptions('--list');
  expect(ok.ok).toBe(true);
  expect(ok.command?.kind).toBe('list');

  const bad = tryParseOptions('--bogus');
  expect(bad.ok).toBe(false);
  expect(bad.err).toBeInstanceOf(Error);
});

test('USAGE mentions the four store actions and the API', () => {
  expect(USAGE).toContain('/profiles');
  expect(USAGE).toContain('--new');
  expect(USAGE).toContain('--modify');
  expect(USAGE).toContain('--delete');
  expect(USAGE).toContain('--list');
  expect(USAGE).toContain('profiles:get');
});
