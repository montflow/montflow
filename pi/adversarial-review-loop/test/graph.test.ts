import { test, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { Effect, Option } from 'effect';
import {
  transitionAfterReview,
  transitionAfterFixer,
  runGraph,
  statusLine,
  type GraphCtx,
  type Ui,
} from '../graph';
import { SkillVerificationError } from '../verify-skill';
import { FeatureSpecValidationError } from '../feature-spec';
import { defaultLoopConfig } from '../config';
import { runEffect, withProjectRoot, type TempDir } from './helpers';

test('statusLine: formats cycle/phase/status', () => {
  expect(statusLine(2, 5, 'reviewer', 'running')).toBe(
    '● adversarial-review-loop [2/5] reviewer: running',
  );
});

test('transitionAfterReview: all terminal → done', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 0, inReview: 0, escalated: 0, resolved: 2, wontFix: 1 }),
      featureSpec: false,
    }),
  ).toBe('done');
});

test('transitionAfterReview: only escalated → escalated', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 0, inReview: 0, escalated: 3, resolved: 0, wontFix: 0 }),
      featureSpec: false,
    }),
  ).toBe('escalated');
});

test('transitionAfterReview: open findings standalone → fixer', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 1, inReview: 0, escalated: 0, resolved: 0, wontFix: 0 }),
      featureSpec: false,
    }),
  ).toBe('fixer');
});

test('transitionAfterReview: open findings feature-spec → featureRemediate', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 1, inReview: 2, escalated: 0, resolved: 0, wontFix: 0 }),
      featureSpec: true,
    }),
  ).toBe('featureRemediate');
});

test('transitionAfterReview: none summary → fixer (not terminal)', () => {
  expect(transitionAfterReview({ summary: Option.none(), featureSpec: false })).toBe('fixer');
});

test('transitionAfterFixer: more cycles → review', () => {
  expect(transitionAfterFixer({ cycle: 2, maxLoops: 5 })).toBe('review');
});

test('transitionAfterFixer: at max → maxLoops', () => {
  expect(transitionAfterFixer({ cycle: 5, maxLoops: 5 })).toBe('maxLoops');
});

/**
 * Creates a mock Pi UI that records notifications.
 * @returns The mock UI plus the recorded notification messages
 */
const mockUi = (): { readonly notifications: string[]; readonly ui: Ui } => {
  const notifications: string[] = [];
  return {
    notifications,
    ui: {
      setStatus: vi.fn(),
      setWidget: vi.fn(),
      notify: vi.fn((message: string, _level: 'info' | 'warning' | 'error') => {
        notifications.push(String(message));
      }),
    },
  };
};

/**
 * Builds loop options with an embedded default config.
 * @param {Partial<GraphCtx['opts']>} [overrides] Option overrides
 * @returns Loop options
 */
const optsWithConfig = (overrides: Partial<GraphCtx['opts']> = {}): GraphCtx['opts'] => {
  const reviewerModel = overrides.reviewerModel ?? 'r';
  const fixerModel = overrides.fixerModel ?? 'f';
  const maxLoops = overrides.maxLoops ?? 3;
  const base = defaultLoopConfig();
  const generic = base.reviewers[0] ?? {
    id: 'generic',
    label: 'Generic',
    model: reviewerModel,
    skillPath: '',
    objective: 'full',
    focus: 'full',
  };
  const config = overrides.config ?? {
    ...base,
    fixerModel,
    maxLoops,
    reviewers: [{ ...generic, model: reviewerModel }],
  };
  return {
    reviewerModel,
    fixerModel,
    maxLoops,
    targetDir: overrides.targetDir ?? '/tmp',
    reviewName: overrides.reviewName ?? 'adversarial',
    fresh: overrides.fresh ?? false,
    featureSpec: overrides.featureSpec ?? false,
    specName: overrides.specName ?? '',
    ...overrides,
    config,
  };
};

/**
 * Builds the initial graph context for tests.
 * @param {TempDir} dir The temp project root
 * @param {Ui} ui The mock UI
 * @param {Partial<GraphCtx['opts']>} [opts] Option overrides
 * @returns The initial context
 */
const testCtx = (dir: TempDir, ui: Ui, opts?: Partial<GraphCtx['opts']>): GraphCtx => ({
  opts: optsWithConfig({ targetDir: dir.tmp, ...opts }),
  cwd: dir.tmp,
  ui,
  validateFeatureSpecFromBranch: () =>
    Effect.fail(new FeatureSpecValidationError({ message: 'unused' })),
});

/**
 * Creates a temp project root with a reviews directory, runs the async
 * callback, then cleans up.
 * @param {(dir: TempDir, reviewFile: string) => Promise<void>} callback The test body
 * @returns A promise completing after cleanup
 */
const withReviewDir = async (
  callback: (dir: TempDir, reviewFile: string) => Promise<void>,
): Promise<void> => {
  const dir = withProjectRoot({});
  const reviewDir = path.join(dir.tmp, '.agents/reviews/adversarial');
  fs.mkdirSync(reviewDir, { recursive: true });
  try {
    await callback(dir, path.join(reviewDir, '001.md'));
  } finally {
    dir.cleanup();
  }
};

test('runGraph: skillGate failure terminates as failed', async () => {
  const dir = withProjectRoot({});
  try {
    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui), {
        verifySkill: () => Effect.fail(new SkillVerificationError({ message: 'missing skills' })),
      }),
    );
    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith('missing skills', 'error');
  } finally {
    dir.cleanup();
  }
});

test('runGraph: reviewer all-terminal → done', () =>
  withReviewDir(async (dir, reviewFile) => {
    const reviewBody = `# Review

## Summary
- **Open**: 0
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 1
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const runAgent = vi.fn((_options, _timeoutMs?: number) =>
      Effect.sync(() => {
        fs.writeFileSync(reviewFile, reviewBody);
        return { text: 'ok', error: undefined };
      }),
    );

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent,
      }),
    );

    expect(result.terminal).toBe('done');
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(ui.setWidget).toHaveBeenCalled();
  }));

test('runGraph: only escalated → escalated', () =>
  withReviewDir(async (dir, reviewFile) => {
    const reviewBody = `# Review

## Summary
- **Open**: 0
- **In Review**: 0
- **Escalated**: 2
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (_options, _timeoutMs) =>
          Effect.sync(() => {
            fs.writeFileSync(reviewFile, reviewBody);
            return { text: 'ok', error: undefined };
          }),
      }),
    );

    expect(result.terminal).toBe('escalated');
  }));

test('runGraph: fixer then maxLoops', () =>
  withReviewDir(async (dir, reviewFile) => {
    const openSummary = `# Review

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    let reviewCalls = 0;

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options, _timeoutMs) =>
          Effect.sync(() => {
            // Reviewer system prompt mentions "adversarial code reviewer"
            if (options.systemPrompt.includes('adversarial code reviewer')) {
              reviewCalls++;
            }
            fs.writeFileSync(reviewFile, openSummary);
            return { text: 'ok', error: undefined };
          }),
      }),
    );

    expect(result.terminal).toBe('maxLoops');
    expect(reviewCalls).toBe(1);
  }));

test('runGraph: consecutive reviewer failures escalate to human', () =>
  withReviewDir(async (dir) => {
    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 5, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (_options, _timeoutMs) =>
          Effect.succeed({ text: '', error: 'model exploded' }),
      }),
    );

    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      'Reviewer failed 2 consecutive times. Escalating to human.',
      'error',
    );
  }));

test('runGraph: early exit when existing review is all-terminal', () =>
  withReviewDir(async (dir, reviewFile) => {
    fs.writeFileSync(
      reviewFile,
      `# Review

## Summary
- **Open**: 0
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 2
- **Won't Fix**: 0
`,
    );
    const { ui } = mockUi();
    const runAgent = vi.fn();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: false }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent,
      }),
    );
    expect(result.terminal).toBe('done');
    expect(runAgent).not.toHaveBeenCalled();
  }));
