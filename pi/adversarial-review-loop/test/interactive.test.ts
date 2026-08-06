import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { defaultSettings, parseFilesInput, parsePositiveInt, settingsMenuItems, type ReviewScope } from '../interactive';
import { buildScopeClause } from '../graph';
import type { LoopOptions } from '../graph';

// ─── parseFilesInput ──────────────────────────────────────────────────

const makeCwd = (): string => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'arl-interactive-'));
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'src', 'auth.ts'), '');
  fs.writeFileSync(path.join(dir, 'README.md'), '');
  return dir;
};

const dir = makeCwd();

test('parseFilesInput: existing paths become files + scope', () => {
  const scope = parseFilesInput(dir, 'src/auth.ts README.md');
  expect(scope.mode).toBe('files');
  expect(scope.files).toEqual(['src/auth.ts', 'README.md']);
  expect(scope.scope).toContain('src/auth.ts');
});

test('parseFilesInput: ignores non-existing tokens but folds them into the scope', () => {
  const scope = parseFilesInput(dir, 'src/auth.ts the auth flow');
  expect(scope.files).toEqual(['src/auth.ts']);
  expect(scope.scope).toContain('src/auth.ts');
  expect(scope.scope).toContain('the auth flow');
});

test('parseFilesInput: no existing token → free-form focus prompt', () => {
  const scope = parseFilesInput(dir, 'Review the login flow for regressions');
  expect(scope.mode).toBe('files');
  expect(scope.files).toEqual([]);
  expect(scope.scope).toBe('Review the login flow for regressions');
});

test('parseFilesInput: commas are separators', () => {
  const scope = parseFilesInput(dir, 'src/auth.ts, README.md');
  expect(scope.files).toEqual(['src/auth.ts', 'README.md']);
});

test('parseFilesInput: empty input → empty scope', () => {
  const scope = parseFilesInput(dir, '   ');
  expect(scope).toEqual<ReviewScope>({ mode: 'files', scope: '', files: [] });
});

test('parseFilesInput: "." selects the whole directory', () => {
  const scope = parseFilesInput(dir, '.');
  expect(scope.mode).toBe('directory');
  expect(scope.files).toEqual([]);
  expect(scope.scope).toContain('entire directory');
});

// ─── parsePositiveInt ────────────────────────────────────────────────

test('parsePositiveInt: accepts positive integers', () => {
  expect(parsePositiveInt('5')).toBe(5);
  expect(parsePositiveInt(' 12 ')).toBe(12);
});

test('parsePositiveInt: rejects zero, negatives, decimals, and junk', () => {
  expect(parsePositiveInt('0')).toBeUndefined();
  expect(parsePositiveInt('-3')).toBeUndefined();
  expect(parsePositiveInt('2.5')).toBeUndefined();
  expect(parsePositiveInt('abc')).toBeUndefined();
  expect(parsePositiveInt('')).toBeUndefined();
  expect(parsePositiveInt('   ')).toBeUndefined();
});

// ─── defaultSettings / settingsMenuItems ─────────────────────────────

test('defaultSettings: mirrors the default loop config', () => {
  const settings = defaultSettings();
  expect(settings.maxLoops).toBeGreaterThan(0);
  expect(settings.fixerModel.trim()).not.toBe('');
  expect(['on-multi', 'always', 'never']).toContain(settings.supervisorMode);
  expect(['on-conflict', 'always', 'never']).toContain(settings.reconcileMode);
  expect(settings.deadlockFlipThreshold).toBeGreaterThan(0);
});

test('settingsMenuItems: shows current values and the done action', () => {
  const settings = defaultSettings();
  const items = settingsMenuItems(settings);
  expect(items.some((item) => item.startsWith('Max loops'))).toBe(true);
  expect(items.some((item) => item.startsWith('Fixer model'))).toBe(true);
  expect(items.some((item) => item.startsWith('Supervisor mode'))).toBe(true);
  expect(items.some((item) => item.startsWith('Supervisor model'))).toBe(true);
  expect(items.some((item) => item.startsWith('Reconcile mode'))).toBe(true);
  expect(items.some((item) => item.startsWith('Deadlock flip threshold'))).toBe(true);
  expect(items[items.length - 1]).toBe('✓ Done — start review');
  expect(items[0]).toContain(String(settings.maxLoops));
});

// ─── buildScopeClause ────────────────────────────────────────────────

const baseOpts = (): LoopOptions => ({
  reviewerModel: 'r',
  fixerModel: 'f',
  maxLoops: 3,
  targetDir: '/tmp',
  reviewName: 'adversarial',
  fresh: false,
  featureSpec: false,
  specName: '',
  config: {} as LoopOptions['config'],
});

test('buildScopeClause: empty when no scope is set', () => {
  expect(buildScopeClause(baseOpts())).toBe('');
});

test('buildScopeClause: includes diff path, files, and free-form scope', () => {
  const clause = buildScopeClause({
    ...baseOpts(),
    scopeDiffPath: '/tmp/reviews/001/scope.diff',
    scopeFiles: ['src/auth.ts'],
    reviewScope: 'Review ONLY the unstaged changes.',
  });
  expect(clause).toContain('/tmp/reviews/001/scope.diff');
  expect(clause).toContain('src/auth.ts');
  expect(clause).toContain('Review ONLY the unstaged changes.');
});

test('buildScopeClause: skips blank scope fields', () => {
  const clause = buildScopeClause({ ...baseOpts(), reviewScope: '  ' });
  expect(clause).toBe('');
});
