import { test, expect } from 'vitest';

import { parseOptions, tryParseOptions } from '../index';

const CWD = '/repo/root';

const parse = (args: string): ReturnType<typeof parseOptions> => parseOptions(args, CWD);

// ─── `--flag=value` form (unchanged behavior) ─────────────────────────

test('parses --flag=value form', () => {
  const opts = parse(
    '--dir=/services/ledger --reviewers=security,quality --name=add-funds --fresh',
  );
  expect(opts.targetDir).toBe('/services/ledger');
  expect(opts.config.reviewers.map((reviewer) => reviewer.id)).toEqual(['security', 'quality']);
  expect(opts.reviewName).toBe('add-funds');
  expect(opts.fresh).toBe(true);
});

// ─── `--flag value` (space-separated) form ────────────────────────────

test('parses space-separated value flags', () => {
  const opts = parse('--dir /services/ledger --reviewers security,quality --name add-funds');
  expect(opts.targetDir).toBe('/services/ledger');
  expect(opts.config.reviewers.map((reviewer) => reviewer.id)).toEqual(['security', 'quality']);
  expect(opts.reviewName).toBe('add-funds');
});

test('parses --target-dir alias in both forms', () => {
  expect(parse('--target-dir=/a/b').targetDir).toBe('/a/b');
  expect(parse('--target-dir /a/b').targetDir).toBe('/a/b');
});

test('mixes space-separated and --flag=value forms', () => {
  const opts = parse('--reviewers security --dir /services/ledger --max-loops=10');
  expect(opts.config.reviewers.map((reviewer) => reviewer.id)).toEqual(['security']);
  expect(opts.targetDir).toBe('/services/ledger');
  expect(opts.maxLoops).toBe(10);
});

test('parses numeric space-separated flags', () => {
  expect(parse('--max-loops 8').maxLoops).toBe(8);
});

// ─── Schema-decoded overrides ────────────────────────────────────────

test('decodes --depth as the max-loops alias', () => {
  expect(parse('--depth=3').maxLoops).toBe(3);
  expect(parse('--depth 4').maxLoops).toBe(4);
});

test('decodes --supervisor-mode via Schema literal', () => {
  expect(parse('--supervisor-mode never').config.supervisor.mode).toBe('never');
  expect(parse('--supervisor-mode=always').config.supervisor.mode).toBe('always');
});

test('rejects invalid values via Schema validation', () => {
  expect(tryParseOptions('--max-loops abc', CWD).ok).toBe(false);
  expect(tryParseOptions('--max-loops 2.5', CWD).ok).toBe(false);
  expect(tryParseOptions('--max-loops 0', CWD).ok).toBe(false);
  expect(tryParseOptions('--supervisor-mode bogus', CWD).ok).toBe(false);
});

// ─── Boolean flags ────────────────────────────────────────────────────

test('parses bare boolean flags', () => {
  const opts = parse('--feature-spec --spec-name add-funds');
  expect(opts.featureSpec).toBe(true);
  expect(opts.specName).toBe('add-funds');
  expect(parse('--fresh').fresh).toBe(true);
});

// ─── Defaults ─────────────────────────────────────────────────────────

test('defaults to cwd and generic reviewer when no flags given', () => {
  const opts = parse('');
  expect(opts.targetDir).toBe(CWD);
  expect(opts.config.reviewers.map((reviewer) => reviewer.id)).toEqual(['generic']);
  expect(opts.maxLoops).toBe(5);
});

// ─── Errors ───────────────────────────────────────────────────────────

test('errors when a value flag is missing its value', () => {
  const result = tryParseOptions('--dir', CWD);
  expect(result.ok).toBe(false);
});

test('errors when a value flag is followed by another flag', () => {
  const result = tryParseOptions('--name --fresh', CWD);
  expect(result.ok).toBe(false);
});

test('errors on unknown flags in both forms', () => {
  expect(tryParseOptions('--bogus=x', CWD).ok).toBe(false);
  expect(tryParseOptions('--bogus x', CWD).ok).toBe(false);
});
