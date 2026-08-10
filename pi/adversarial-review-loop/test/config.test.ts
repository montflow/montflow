import { test, expect } from 'vitest';
import { defaultLoopConfig, genericReviewer, makeReviewerProfile } from '../config';

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
  // Thinking levels default to unset (pi default applies at use time).
  expect(config.reviewers[0]?.thinkingLevel).toBeUndefined();
  expect(config.supervisor.thinkingLevel).toBeUndefined();
  expect(config.fixerThinkingLevel).toBeUndefined();
});

test('genericReviewer: custom model + objective/focus sync', () => {
  const profile = genericReviewer('m1');
  expect(profile.model).toBe('m1');
  expect(profile.objective).toBe(profile.focus);
  expect(profile.thinkingLevel).toBeUndefined();
});

test('makeReviewerProfile: carries an explicit thinking level through', () => {
  const profile = makeReviewerProfile({
    id: 'auditor',
    label: 'Auditor',
    model: 'm1',
    skillPath: '/skills/reviewer',
    objective: 'audit everything',
    thinkingLevel: 'xhigh',
  });
  expect(profile.thinkingLevel).toBe('xhigh');
  expect(profile.focus).toBe(profile.objective);
});
