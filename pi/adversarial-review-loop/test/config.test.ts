import { test, expect } from 'vitest';
import { defaultLoopConfig, genericReviewer } from '../config';

test('defaultLoopConfig: single generic reviewer behind an always-on supervisor', () => {
  const config = defaultLoopConfig();
  expect(config.reviewers).toHaveLength(1);
  expect(config.reviewers[0]?.id).toBe('generic');
  expect(config.supervisor.model).not.toBe('');
  expect(config.supervisor.skillPath).not.toBe('');
  expect(config.deadlock.flipThreshold).toBe(2);
  expect(config.agentConcurrency).toBe(5);
  // Loop/cycle split: multiple independent loops, cycles capped per loop.
  expect(config.maxLoops).toBeGreaterThan(0);
  expect(config.maxCycles).toBeGreaterThan(0);
});

test('genericReviewer: custom model + objective/focus sync', () => {
  const profile = genericReviewer('m1');
  expect(profile.model).toBe('m1');
  expect(profile.objective).toBe(profile.focus);
});
