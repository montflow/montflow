import { test, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { PresetLoopConfigDecoded } from '../preset-schema';
import {
  deletePreset,
  isValidPresetName,
  listPresets,
  presetExists,
  readPreset,
  writePreset,
} from '../preset-store';
import { runEffect, runResult, withProjectRoot, type TempDir } from './helpers';

/**
 * Creates a temp directory, runs the async callback, then cleans up.
 * @param {(dir: TempDir) => Promise<void>} callback The test body
 * @returns A promise completing after cleanup
 */
const withTempDir = async (callback: (dir: TempDir) => Promise<void>): Promise<void> => {
  const dir = withProjectRoot({});
  try {
    await callback(dir);
  } finally {
    dir.cleanup();
  }
};

const presetPath = (tmp: string, name: string): string =>
  path.join(tmp, '.agents', 'review-presets', `${name}.json`);

const storedConfig = (): PresetLoopConfigDecoded => ({
  reviewers: [{ type: 'builtin', id: 'generic' }],
  supervisor: { model: 'deepseek-v4-pro' },
  fixerModel: 'deepseek-v4-flash-free',
  maxLoops: 5,
  deadlock: { flipThreshold: 2, action: 'escalate' },
});

test('preset store: write → list → read round-trips the config', () =>
  withTempDir(async ({ tmp }) => {
    await runEffect(writePreset(tmp, 'security-audit', storedConfig()));

    const names = await runEffect(listPresets(tmp));
    expect(names).toEqual(['security-audit']);

    const preset = await runEffect(readPreset(tmp, 'security-audit'));
    expect(preset.version).toBe(1);
    expect(preset.name).toBe('security-audit');
    expect(preset.config.maxLoops).toBe(5);
    expect(preset.config.reviewers).toEqual([{ type: 'builtin', id: 'generic' }]);

    const raw = JSON.parse(fs.readFileSync(presetPath(tmp, 'security-audit'), 'utf8'));
    expect(raw.version).toBe(1);
    expect(raw.config.fixerModel).toBe('deepseek-v4-flash-free');
    // The stored file references reviewers — no expanded profile data.
    expect(raw.config.reviewers[0].type).toBe('builtin');
  }));

test('preset store: overwrite replaces the stored config', () =>
  withTempDir(async ({ tmp }) => {
    await runEffect(writePreset(tmp, 'audit', storedConfig()));
    await runEffect(
      writePreset(tmp, 'audit', { ...storedConfig(), maxLoops: 9 }),
    );

    const preset = await runEffect(readPreset(tmp, 'audit'));
    expect(preset.config.maxLoops).toBe(9);
  }));

test('preset store: delete removes the file and list empties', () =>
  withTempDir(async ({ tmp }) => {
    await runEffect(writePreset(tmp, 'temp', storedConfig()));
    expect(fs.existsSync(presetPath(tmp, 'temp'))).toBe(true);

    await runEffect(deletePreset(tmp, 'temp'));
    expect(fs.existsSync(presetPath(tmp, 'temp'))).toBe(false);
    expect(await runEffect(listPresets(tmp))).toEqual([]);
  }));

test('preset store: reading a missing preset fails with PresetError', () =>
  withTempDir(async ({ tmp }) => {
    const result = await runResult(readPreset(tmp, 'nope'));
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') expect(result.failure.message).toContain('nope');
  }));

test('preset store: deleting a missing preset fails', () =>
  withTempDir(async ({ tmp }) => {
    const result = await runResult(deletePreset(tmp, 'nope'));
    expect(result._tag).toBe('Failure');
  }));

test('preset store: presetExists reflects the file', () =>
  withTempDir(async ({ tmp }) => {
    expect(await runEffect(presetExists(tmp, 'audit'))).toBe(false);
    await runEffect(writePreset(tmp, 'audit', storedConfig()));
    expect(await runEffect(presetExists(tmp, 'audit'))).toBe(true);
  }));

test('preset store: invalid preset names are rejected on write', () =>
  withTempDir(async ({ tmp }) => {
    const result = await runResult(writePreset(tmp, '../escape', storedConfig()));
    expect(result._tag).toBe('Failure');
    expect(fs.existsSync(presetPath(tmp, '../escape'))).toBe(false);
  }));

test('preset store: list ignores non-json files and hidden entries', () =>
  withTempDir(async ({ tmp }) => {
    const root = path.join(tmp, '.agents', 'review-presets');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'a.json'), '{}');
    fs.writeFileSync(path.join(root, 'b.json'), '{}');
    fs.writeFileSync(path.join(root, 'readme.txt'), 'not a preset');
    fs.writeFileSync(path.join(root, '.hidden.json'), '{}');
    const names = await runEffect(listPresets(tmp));
    expect(names).toEqual(['a', 'b']);
  }));

test('preset store: invalid preset JSON fails to read with a clear error', () =>
  withTempDir(async ({ tmp }) => {
    const root = path.join(tmp, '.agents', 'review-presets');
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, 'broken.json'), 'not json at all');
    const result = await runResult(readPreset(tmp, 'broken'));
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') expect(result.failure.message).toContain('broken.json');
  }));

test('isValidPresetName: accepts safe names, rejects traversal and spaces', () => {
  expect(isValidPresetName('security-audit')).toBe(true);
  expect(isValidPresetName('a_b.c-d')).toBe(true);
  expect(isValidPresetName('audit2')).toBe(true);
  expect(isValidPresetName('../escape')).toBe(false);
  expect(isValidPresetName('a/b')).toBe(false);
  expect(isValidPresetName('a b')).toBe(false);
  expect(isValidPresetName('.hidden')).toBe(false);
  expect(isValidPresetName('')).toBe(false);
});
