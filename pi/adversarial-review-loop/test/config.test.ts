import { test, expect } from 'vitest';
import {
  defaultLoopConfig,
  BUILTIN_REVIEWERS,
  genericReviewer,
  usesSupervisor,
} from '../config';

test('defaultLoopConfig: single generic reviewer, supervisor on-multi', () => {
  const config = defaultLoopConfig();
  expect(config.reviewers).toHaveLength(1);
  expect(config.reviewers[0]?.id).toBe('generic');
  expect(config.supervisor.mode).toBe('on-multi');
  expect(usesSupervisor(config)).toBe(false);
  expect(config.reconciliator.mode).toBe('on-conflict');
  expect(config.deadlock.flipThreshold).toBe(2);
});

test('usesSupervisor: on-multi with multiple reviewers', () => {
  const base = defaultLoopConfig();
  const config = {
    ...base,
    reviewers: [
      genericReviewer(),
      {
        ...BUILTIN_REVIEWERS.security!,
        model: 'm',
        skillPath: BUILTIN_REVIEWERS.security!.skillPath,
        objective: BUILTIN_REVIEWERS.security!.objective,
        focus: BUILTIN_REVIEWERS.security!.objective,
        label: 'Security',
      },
    ],
  };
  expect(usesSupervisor(config)).toBe(true);
});

test('usesSupervisor: never disables even with multi roster', () => {
  const base = defaultLoopConfig();
  const config = {
    ...base,
    supervisor: { ...base.supervisor, mode: 'never' as const },
    reviewers: [genericReviewer(), genericReviewer('m2')],
  };
  // duplicate ids still length > 1 — mode never wins
  expect(usesSupervisor(config)).toBe(false);
});

test('genericReviewer: custom model + objective/focus sync', () => {
  const profile = genericReviewer('m1');
  expect(profile.model).toBe('m1');
  expect(profile.objective).toBe(profile.focus);
});
