import { test, expect } from 'vitest';
import nodePath from 'node:path';
import fs from 'node:fs';
import {
  briefPath,
  emptyLoopState,
  fixerScratchPath,
  isStoredConfig,
  loadLoopState,
  loopStatePath,
  passDir,
  passScratchPath,
  saveLoopState,
} from '../loop-state';
import { runEffect, withProjectRoot } from './helpers';

const sampleConfig = {
  reviewers: [
    { id: 'generic', label: 'Generic', model: 'm', skillPath: '/s', objective: 'o', focus: 'o' },
  ],
  supervisor: { model: 'm', skillPath: '/s2' },
  fixerModel: 'f',
  maxLoops: 5,
  maxCycles: 5,
  agentConcurrency: 3,
  deadlock: { flipThreshold: 2, action: 'escalate' as const },
};

test('loop state: config snapshot round-trips through save/load', async () => {
  const dir = withProjectRoot({});
  try {
    const file = `${dir.tmp}/review.md`;
    await runEffect(saveLoopState(file, { ...emptyLoopState(['generic']), config: sampleConfig }));
    const loaded = await runEffect(loadLoopState(file, ['generic']));
    expect(loaded.config?.maxLoops).toBe(5);
    expect(loaded.config?.maxCycles).toBe(5);
    expect(loaded.config?.fixerModel).toBe('f');
    expect(loaded.config?.reviewers[0]?.id).toBe('generic');
  } finally {
    dir.cleanup();
  }
});

test('loop state: legacy snapshot without maxCycles is normalized (old maxLoops = cycles)', async () => {
  const dir = withProjectRoot({});
  try {
    const file = `${dir.tmp}/review.md`;
    const legacy = { ...sampleConfig } as Partial<typeof sampleConfig>;
    delete (legacy as { maxCycles?: number }).maxCycles;
    await runEffect(
      saveLoopState(file, { ...emptyLoopState(['generic']), config: legacy as never }),
    );
    const loaded = await runEffect(loadLoopState(file, ['generic']));
    // Old maxLoops meant cycles → becomes the per-loop cycle cap; the loop
    // count takes the default.
    expect(loaded.config?.maxCycles).toBe(5);
    expect(loaded.config?.maxLoops).toBe(3);
    expect(loaded.loop).toBe(0);
    expect(loaded.version).toBe(2);
  } finally {
    dir.cleanup();
  }
});

test('loop state: legacy state without config loads with config undefined', async () => {
  const dir = withProjectRoot({});
  try {
    const file = `${dir.tmp}/review.md`;
    await runEffect(saveLoopState(file, emptyLoopState(['generic'])));
    const loaded = await runEffect(loadLoopState(file, ['generic']));
    expect(loaded.config).toBeUndefined();
  } finally {
    dir.cleanup();
  }
});

test('loop state: v1 states migrate to v2 with loop 0', async () => {
  const dir = withProjectRoot({});
  try {
    const file = `${dir.tmp}/review.md`;
    // Write a pre-loop/cycle v1 state by hand (version 1, no loop field).
    const v1 = JSON.stringify({
      version: 1,
      cycle: 3,
      roster: ['generic'],
      findings: {},
      conflicts: [],
      deadlocks: [],
    });
    const dirPath = nodePath.dirname(file);
    fs.mkdirSync(nodePath.join(dirPath, 'review'), { recursive: true });
    fs.writeFileSync(nodePath.join(dirPath, 'review', 'loop-state.json'), v1);
    const loaded = await runEffect(loadLoopState(file, ['generic']));
    expect(loaded.version).toBe(2);
    expect(loaded.loop).toBe(0);
    expect(loaded.cycle).toBe(3); // last completed cycle preserved
  } finally {
    dir.cleanup();
  }
});

test('loop state: pass paths are keyed by loop then cycle (1-based)', () => {
  const reviewFile = '/tmp/.agents/reviews/adversarial/001.md';
  const dir = passDir(reviewFile, 2, 3);
  expect(dir).toBe('/tmp/.agents/reviews/adversarial/001/passes/2/3');
  expect(briefPath(reviewFile, 2, 3)).toBe(nodePath.join(dir, 'brief.md'));
  expect(passScratchPath(reviewFile, 2, 3, 'security')).toBe(
    nodePath.join(dir, 'scratch', 'security.md'),
  );
  expect(fixerScratchPath(reviewFile, 2, 3, 'F1')).toBe(nodePath.join(dir, 'fixes', 'F1.md'));
  // Different loop or cycle → different pass dir.
  expect(passDir(reviewFile, 1, 3)).not.toBe(dir);
  expect(passDir(reviewFile, 2, 2)).not.toBe(dir);
  expect(loopStatePath(reviewFile)).toBe(
    '/tmp/.agents/reviews/adversarial/001/loop-state.json',
  );
});

test('isStoredConfig: validates the snapshot shape', () => {
  expect(isStoredConfig(sampleConfig)).toBe(true);
  expect(isStoredConfig(null)).toBe(false);
  expect(isStoredConfig({ reviewers: 'nope' })).toBe(false);
  expect(isStoredConfig({ ...sampleConfig, supervisor: { model: 'm' } })).toBe(false);
  // Legacy snapshots (no maxCycles) are still recognized — normalizeStoredConfig
  // fills the per-loop cycle cap at load time.
  const legacy = { ...sampleConfig } as Partial<typeof sampleConfig>;
  delete (legacy as { maxCycles?: number }).maxCycles;
  expect(isStoredConfig(legacy as never)).toBe(true);
});
