import { test, expect } from 'vitest';
import {
  defaultLoopConfig,
  resolveLoopConfigPure,
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

test('resolveLoopConfigPure: defaults without file or ids', () => {
  const config = resolveLoopConfigPure(
    {
      configPath: '',
      reviewerIds: [],
      reviewerModel: undefined,
      fixerModel: undefined,
      maxLoops: undefined,
      cwd: '/tmp',
    },
    undefined,
  );
  expect(typeof config).not.toBe('string');
  if (typeof config === 'string') return;
  expect(config.reviewers.map((profile) => profile.id)).toEqual(['generic']);
  expect(usesSupervisor(config)).toBe(false);
});

test('resolveLoopConfigPure: --reviewers selects builtins', () => {
  const config = resolveLoopConfigPure(
    {
      configPath: '',
      reviewerIds: ['security', 'linguist'],
      reviewerModel: undefined,
      fixerModel: 'fixer-x',
      maxLoops: 7,
      cwd: '/tmp',
    },
    undefined,
  );
  expect(typeof config).not.toBe('string');
  if (typeof config === 'string') return;
  expect(config.reviewers.map((profile) => profile.id)).toEqual(['security', 'linguist']);
  expect(config.fixerModel).toBe('fixer-x');
  expect(config.maxLoops).toBe(7);
  expect(config.reviewers[0]?.objective).toBe(BUILTIN_REVIEWERS.security?.objective);
  expect(usesSupervisor(config)).toBe(true);
});

test('resolveLoopConfigPure: unknown reviewer id errors', () => {
  const config = resolveLoopConfigPure(
    {
      configPath: '',
      reviewerIds: ['nope'],
      reviewerModel: undefined,
      fixerModel: undefined,
      maxLoops: undefined,
      cwd: '/tmp',
    },
    undefined,
  );
  expect(typeof config).toBe('string');
  if (typeof config !== 'string') return;
  expect(config).toContain("Unknown reviewer id 'nope'");
});

test('resolveLoopConfigPure: global reviewer model overrides all', () => {
  const config = resolveLoopConfigPure(
    {
      configPath: '',
      reviewerIds: ['technical', 'style'],
      reviewerModel: 'heavy-model',
      fixerModel: undefined,
      maxLoops: undefined,
      cwd: '/tmp',
    },
    undefined,
  );
  expect(typeof config).not.toBe('string');
  if (typeof config === 'string') return;
  expect(config.reviewers.every((profile) => profile.model === 'heavy-model')).toBe(true);
});

test('resolveLoopConfigPure: supervisor-mode CLI override', () => {
  const config = resolveLoopConfigPure(
    {
      configPath: '',
      reviewerIds: ['generic'],
      reviewerModel: undefined,
      fixerModel: undefined,
      maxLoops: undefined,
      cwd: '/tmp',
      supervisorMode: 'always',
    },
    undefined,
  );
  expect(typeof config).not.toBe('string');
  if (typeof config === 'string') return;
  expect(config.supervisor.mode).toBe('always');
  expect(usesSupervisor(config)).toBe(true);
});

test('genericReviewer: custom model + objective/focus sync', () => {
  const profile = genericReviewer('m1');
  expect(profile.model).toBe('m1');
  expect(profile.objective).toBe(profile.focus);
});
