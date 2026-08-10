import { test, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import path from 'node:path';
import { Effect, Option } from 'effect';
import {
  buildScopeClause,
  transitionAfterReview,
  transitionAfterFixer,
  runGraph,
  statusLine,
  type GraphCtx,
  type Ui,
} from '../graph';
import { SkillVerificationError } from '../verify-skill';
import { defaultLoopConfig } from '../config';
import { emptyLoopState, saveLoopState } from '../loop-state';
import { runEffect, withProjectRoot, type TempDir } from './helpers';

// Hermetic: a dev shell inside herdr exports HERDR_ENV — graph tests must not
// emit pane.report_agent messages to the user's real herdr socket.
beforeAll(() => {
  delete process.env.HERDR_ENV;
});

test('statusLine: formats loop/cycle/phase/status', () => {
  expect(statusLine(0, 3, 1, 5, 'reviewer', 'running')).toBe(
    '● adversarial-review-loop [loop 1/3 · cycle 1/5] reviewer: running',
  );
  expect(statusLine(2, 3, 5, 5, 'fixer', 'running')).toBe(
    '● adversarial-review-loop [loop 3/3 · cycle 5/5] fixer: running',
  );
});

test('transitionAfterReview: all terminal → consensus (loop complete)', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 0, inReview: 0, escalated: 0, resolved: 2, wontFix: 1 }),
    }),
  ).toBe('consensus');
});

test('transitionAfterReview: only escalated → escalated', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 0, inReview: 0, escalated: 3, resolved: 0, wontFix: 0 }),
    }),
  ).toBe('escalated');
});

test('transitionAfterReview: open findings → fixer', () => {
  expect(
    transitionAfterReview({
      summary: Option.some({ open: 1, inReview: 0, escalated: 0, resolved: 0, wontFix: 0 }),
    }),
  ).toBe('fixer');
});

test('transitionAfterReview: none summary → fixer (not terminal)', () => {
  expect(transitionAfterReview({ summary: Option.none() })).toBe('fixer');
});

test('transitionAfterFixer: under the per-loop cycle cap → same reviewers re-review', () => {
  expect(transitionAfterFixer({ cycle: 2, maxCycles: 5 })).toBe('review');
});

test('transitionAfterFixer: at the cycle cap → cycleMax decision', () => {
  expect(transitionAfterFixer({ cycle: 5, maxCycles: 5 })).toBe('cycleMax');
});

test('buildScopeClause: includes the user directive', () => {
  const opts = optsWithConfig({
    directive: 'audit only the file-signing flow in src/crypto/',
  });
  expect(buildScopeClause(opts)).toContain(
    'USER DIRECTIVE — audit only the file-signing flow in src/crypto/',
  );
});

test('buildScopeClause: empty directive is omitted', () => {
  expect(buildScopeClause(optsWithConfig({ directive: '   ' }))).toBe('');
});

test('buildScopeClause: directive mode does not repeat the directive as Scope', () => {
  // Directive mode sets reviewScope == directive (see optsFromConfig) — the
  // clause must not emit the text twice.
  const directive = 'check the import feature';
  const clause = buildScopeClause(
    optsWithConfig({ directive, reviewScope: directive }),
  );
  expect(clause).toBe(`USER DIRECTIVE — ${directive}`);
  expect(clause.split('check the import feature')).toHaveLength(2);
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
  const maxCycles = overrides.maxCycles ?? 5;
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
    maxCycles,
    reviewers: [{ ...generic, model: reviewerModel }],
  };
  return {
    reviewerModel,
    fixerModel,
    maxLoops,
    maxCycles,
    targetDir: overrides.targetDir ?? '/tmp',
    reviewName: overrides.reviewName ?? 'adversarial',
    fresh: overrides.fresh ?? false,
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

/** Parses the reviewer's scratch output path from its task prompt (fresh or re-review). */
const reviewerOutputPath = (task: string): string | undefined =>
  task.match(/write the report to (.+?) using its standard file structure/)?.[1] ??
  task.match(/Write your updated report to (.+?) — always your own scratch path/)?.[1];

/**
 * Fake persistent-agent factory: every call returns a NEW fake session whose
 * prompt dispatches on task content — writes the pass brief for brief turns,
 * the canonical review for aggregate turns, the reviewer scratch for reviewer
 * turns (or fails when `reviewerError` is set), and records every prompt.
 * @param {string} reviewFile Canonical review path
 * @param {string} canonical Canonical body written at aggregate time
 * @param {object} [opts] Behavior tweaks
 * @returns A factory returning a fresh fake session per call
 */
const fakeAgentFactory = (
  reviewFile: string,
  canonical: string,
  opts: {
    readonly reviewerError?: string;
    readonly timeoutBriefOnCreate?: number;
    readonly onPrompt?: (task: string) => void;
  } = {},
) => {
  let created = 0;
  const disposals: number[] = [];
  return {
    disposals,
    create: () => {
      const id = ++created;
      return {
        prompt: (task: string) =>
          Effect.sync(() => {
            opts.onPrompt?.(task);
            const brief = task.match(/Write the pass brief to: (\S+)/)?.[1];
            if (brief !== undefined) {
              if (opts.timeoutBriefOnCreate === id) {
                return {
                  text: '',
                  error: 'm — Agent run timed out after 600000ms',
                  timedOut: true,
                };
              }
              fs.mkdirSync(path.dirname(brief), { recursive: true });
              fs.writeFileSync(brief, '# Pass brief — cycle\n\nScope: review src/.\n');
              return { text: 'ok', error: undefined };
            }
            if (task.includes('AGGREGATE TURN')) {
              fs.writeFileSync(reviewFile, canonical);
              return { text: 'ok', error: undefined };
            }
            // Reviewer turn.
            if (opts.reviewerError !== undefined) {
              return { text: '', error: opts.reviewerError };
            }
            const output = reviewerOutputPath(task);
            if (output !== undefined) {
              fs.mkdirSync(path.dirname(output), { recursive: true });
              fs.writeFileSync(output, '# Scratch\n');
            }
            return { text: 'ok', error: undefined };
          }),
        dispose: () =>
          Effect.sync(() => {
            disposals.push(id);
          }),
      };
    },
  };
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

test('runGraph: consensus advances through every configured loop then done', () =>
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
    const reviewerPrompts: string[] = [];

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 2, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () =>
          Effect.succeed(fakeAgentFor(reviewFile, reviewBody, reviewerPrompts)),
      }),
    );

    expect(result.terminal).toBe('done');
    // The same single reviewer re-reviewed within each loop; a fresh set was
    // spawned for loop 2 (2 reviewer sessions + 2 supervisor sessions). Only
    // the reviewer turns carry a scratch output path.
    expect(reviewerPrompts.filter((task) => reviewerOutputPath(task) !== undefined)).toHaveLength(2);
    // Loop-state persisted the final loop index (0-based): loop 2 of 2 done.
    const statePath = path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { loop?: number };
    expect(state.loop).toBe(1);
  }));

/** Convenience: a session-writing fake for a single reviewer+supervisor pair. */
const fakeAgentFor = (
  reviewFile: string,
  canonical: string,
  prompts: string[],
): {
  prompt: (task: string) => Effect.Effect<{ text: string; error: string | undefined; timedOut?: boolean }>;
  dispose: () => Effect.Effect<void>;
} => ({
  prompt: (task: string) => {
    prompts.push(task);
    const brief = task.match(/Write the pass brief to: (\S+)/)?.[1];
    if (brief !== undefined) {
      fs.mkdirSync(path.dirname(brief), { recursive: true });
      fs.writeFileSync(brief, '# Pass brief — cycle\n\nScope: review src/.\n');
      return Effect.succeed({ text: 'ok', error: undefined });
    }
    if (task.includes('AGGREGATE TURN')) {
      fs.writeFileSync(reviewFile, canonical);
      return Effect.succeed({ text: 'ok', error: undefined });
    }
    const output = reviewerOutputPath(task);
    if (output !== undefined) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, '# Scratch\n');
    }
    return Effect.succeed({ text: 'ok', error: undefined });
  },
  dispose: () => Effect.succeed(undefined),
});

test('runGraph: a Summary claiming Open: 0 does not false-terminate done while an Open block exists', () =>
  withReviewDir(async (dir, reviewFile) => {
    // F1/F14 trigger: the supervisor (an LLM) miscounts — the Summary says
    // Open: 0 while an Open finding block is present. The review node must
    // recompute the counts from the blocks and dispatch the fixer, never
    // terminate 'done' on the agent-written Summary.
    const reviewBody = `# Review

## Findings

#### F1 — Open bug
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 0
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const fixerTasks: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          // The fixer completes properly (writes its updated block — the
          // finding stays Open, so the recomputed Summary still shows it):
          // this test is about the Summary miscount, not fixer failures.
          fixerTasks.push(options.task);
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Not fixed yet\n- **Severity**: Major\n- **Location**: \`src/a.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: Open\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, reviewBody, [])),
      }),
    );

    // open=1 derived from the finding block → fixer, never the false 'done'.
    expect(result.terminal).not.toBe('done');
    // maxCycles=1, headless → the loop reached the fixer phase and exhausted
    // its per-loop cycle budget.
    expect(result.terminal).toBe('maxLoops');
    expect(fixerTasks).toHaveLength(1); // the open finding was dispatched
    // The on-disk Summary was recomputed from the blocks (Open: 1), not the
    // supervisor's miscounted Open: 0.
    const final = fs.readFileSync(reviewFile, 'utf8');
    expect(final).toContain('- **Open**: 1');
    expect(final).not.toContain('- **Open**: 0');
  }));

test('runGraph: only escalated → escalated', () =>
  withReviewDir(async (dir, reviewFile) => {
    const reviewBody = `# Review

## Findings

#### F1 — Escalated one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Escalated
- **Attempts**: 3
- **First Seen**: 1

### Discussion

#### F2 — Escalated two
- **Severity**: Minor
- **Location**: \`src/b.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Escalated
- **Attempts**: 3
- **First Seen**: 1

### Discussion

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
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, reviewBody, [])),
      }),
    );

    expect(result.terminal).toBe('escalated');
  }));

test('runGraph: headless cycle cap exhaustion terminates maxLoops', () =>
  withReviewDir(async (dir, reviewFile) => {
    // The canonical always carries an Open finding (the fake aggregate rewrites
    // it every cycle), so the loop keeps fixing without consensus until the
    // per-loop cycle cap. Without an askUser impl the loop terminates maxLoops.
    const openSummary = `# Review

## Findings

#### F1 — Bug
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 2, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          // Fixer writes an updated (still In Review) block to its scratch.
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/x.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, openSummary, [])),
      }),
    );

    expect(result.terminal).toBe('maxLoops');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('reached the cycle cap (2) without consensus'),
      'warning',
    );
  }));

test('runGraph: cycle cap decision — increase cycle max keeps the same loop', () =>
  withReviewDir(async (dir, reviewFile) => {
    const openSummary = `# Review

## Findings

#### F1 — Bug
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const choices = ['Increase cycle max', 'Stop'];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/x.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, openSummary, [])),
        askUser: async (_question, options) => choices.shift() ?? options[0] ?? null,
      }),
    );

    // The user raised the cap once, then stopped.
    expect(result.terminal).toBe('stopped');
    // The bump persisted into the locked-in config snapshot.
    const statePath = path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      config?: { maxCycles?: number };
    };
    expect(state.config?.maxCycles).toBe(2);
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Cycle cap raised to 2'),
      'info',
    );
  }));

test('runGraph: cycle cap decision — resume to NEXT loop spawns fresh reviewers', () =>
  withReviewDir(async (dir, reviewFile) => {
    const openSummary = `# Review

## Findings

#### F1 — Bug
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const prompts: string[] = [];
    const choices = ['Resume to NEXT loop', 'Stop'];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 2, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/x.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () =>
          Effect.succeed(fakeAgentFor(reviewFile, openSummary, prompts)),
        askUser: async (_question, options) => choices.shift() ?? options[0] ?? null,
      }),
    );

    expect(result.terminal).toBe('stopped');
    // Loop 1 (0-based) ran a review pass after advancing — the fresh set of
    // reviewers for loop 2 was prompted (1 reviewer per loop in the default
    // roster: loop 1 cycle + loop 2 cycle).
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    const statePath = path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { loop?: number };
    expect(state.loop).toBe(1);
  }));

test('runGraph: cycle cap decision — add a new loop at the loop cap', () =>
  withReviewDir(async (dir, reviewFile) => {
    const openSummary = `# Review

## Findings

#### F1 — Bug
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: p.
- **Impact**: i.
- **Suggestion**: s.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const choices = ['Add a new loop', 'Stop'];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/x.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, openSummary, [])),
        askUser: async (_question, options) => choices.shift() ?? options[0] ?? null,
      }),
    );

    expect(result.terminal).toBe('stopped');
    // The loop cap was extended and persisted in the config snapshot.
    const statePath = path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      loop?: number;
      config?: { maxLoops?: number };
    };
    expect(state.config?.maxLoops).toBe(2);
    expect(state.loop).toBe(1);
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('max loops is now 2'),
      'info',
    );
  }));

test('runGraph: reviewers run concurrently and each writes its scratch file', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    const base = defaultLoopConfig();
    const generic =
      base.reviewers[0] ?? {
        id: 'generic',
        label: 'Generic',
        model: 'r',
        skillPath: '',
        objective: 'full',
        focus: 'full',
      };
    const security = { ...generic, id: 'security', label: 'Security' };
    const config = { ...base, maxLoops: 1, maxCycles: 1, reviewers: [generic, security], fixerModel: 'f' };
    const prompts: string[] = [];

    await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, '# Review\n', prompts)),
      }),
    );

    // Both roster reviewers were dispatched (one session per reviewer, loop 1
    // only with maxLoops 1 → consensus or not, only one cycle) and each wrote
    // its own scratch file (reviewers are independent — they run in parallel,
    // capped by concurrency).
    const reviewerPrompts = prompts.filter((task) => reviewerOutputPath(task) !== undefined);
    expect(reviewerPrompts).toHaveLength(2);
    const scratchDir = path.join(dir.tmp, '.agents/reviews/adversarial/001/passes/1/1/scratch');
    expect(fs.existsSync(path.join(scratchDir, 'generic.md'))).toBe(true);
    expect(fs.existsSync(path.join(scratchDir, 'security.md'))).toBe(true);
  }));

test('runGraph: fixer runs one agent per open finding, scoped to it', () =>
  withReviewDir(async (dir, reviewFile) => {
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

### Major

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

#### F2 — Bug two
- **Severity**: Minor
- **Location**: \`src/b.ts\`
- **Problem**: Other thing.
- **Impact**: Meh.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 1
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 2
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const fixerTasks: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options, _timeoutMs) => {
          // Fixer: write an updated block to its scratch file.
          fixerTasks.push(options.task);
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/x.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
      }),
    );

    expect(result.terminal).toBe('maxLoops');
    // One fixer agent per open finding, each scoped to its own finding.
    expect(fixerTasks).toHaveLength(2);
    const tasks = fixerTasks.join('\n');
    expect(tasks).toContain('F1');
    expect(tasks).toContain('F2');
    // Each task is scoped: the F1 task doesn't mention F2 and vice versa.
    expect(fixerTasks.find((task) => task.includes('F1'))).not.toContain('F2');
    expect(fixerTasks.find((task) => task.includes('F2'))).not.toContain('F1');

    // The fixers' scratch blocks were merged into the canonical.
    const final = fs.readFileSync(reviewFile, 'utf8');
    expect(final).toContain('Status**: In Review');
    expect(final).not.toContain('Status**: Open');
  }));

test('runGraph: a fixer that produces no scratch block notifies per-finding (F20)', () =>
  withReviewDir(async (dir, reviewFile) => {
    // F20 trigger: `runFindingFixer` returns null when the agent run failed OR
    // the scratch is missing/malformed — previously a silent no-op, so a fixer
    // that fixed the code but never wrote its block landed unrecorded and
    // unverified (the F5/F18 divergence). The fixer node must now notify
    // per-finding so the divergence is visible instead of a silent null.
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const fixerTasks: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          // Fixer "runs" (returns success) but never writes its scratch block.
          fixerTasks.push(options.task);
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
      }),
    );

    // The fixer was re-dispatched until its attempt budget ran out (initial +
    // MAX_FIXER_DISPATCH_ATTEMPTS-1 re-dispatches)…
    expect(fixerTasks).toHaveLength(3);
    expect(fixerTasks[0]).toContain('F1');
    // …each failure is notified per-finding with the SPECIFIC reason +
    // expected scratch path instead of a silent null…
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Fixer for F1: finished but wrote no scratch block'),
      'warning',
    );
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('passes/1/1/fixes/F1.md'),
      'warning',
    );
    // …the failures were re-dispatched with hand-off context (not resumed)…
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Re-dispatching 1 failed fixer(s) (F1)'),
      'info',
    );
    // The failure reason is recorded next to the scratch (fixes/F1.error.json)
    // so a resume can hand it to the re-dispatched fixer as context.
    expect(fs.existsSync(path.join(dir.tmp, '.agents/reviews/adversarial/001/passes/1/1/fixes/F1.error.json'))).toBe(true);
    // A finding that still produced no block after every attempt escalates to
    // a human — the phase NEVER resumes with a failed finding.
    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Fixer phase failed: F1 could not be fixed after 3 attempt(s)'),
      'error',
    );
    // …and the unrecorded fix is NOT merged into the canonical: F1 stays Open.
    const final = fs.readFileSync(reviewFile, 'utf8');
    expect(final).toContain('Status**: Open');
    expect(final).not.toContain('Status**: In Review');
  }));

test('runGraph: resume at the fixer phase recovers valid scratch checkpoints without re-dispatch', () =>
  withReviewDir(async (dir, reviewFile) => {
    // A previous pass finished reviewing (phase 'reviewed') but died during
    // the fixer merge. The fixer's valid scratch block survives on disk; the
    // resume must merge it without re-dispatching a fixer agent.
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;
    fs.writeFileSync(reviewFile, canonical);

    // Locked-in config + phase 'reviewed' → resume routes straight to fixer.
    const config = { ...defaultLoopConfig(), maxLoops: 1, maxCycles: 1 };
    const state = {
      ...emptyLoopState(['generic']),
      loop: 0,
      cycle: 1,
      config,
      phase: 'reviewed' as const,
    };
    fs.mkdirSync(path.join(dir.tmp, '.agents/reviews/adversarial/001'), { recursive: true });
    fs.writeFileSync(
      path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json'),
      JSON.stringify(state, null, 2),
    );

    // The interrupted fixer DID write its updated block (Status: In Review).
    const scratchDir = path.join(dir.tmp, '.agents/reviews/adversarial/001/passes/1/1/fixes');
    fs.mkdirSync(scratchDir, { recursive: true });
    fs.writeFileSync(
      path.join(scratchDir, 'F1.md'),
      `#### F1 — Bug one\n- **Severity**: Major\n- **Location**: \`src/a.ts\`\n- **Problem**: Wrong thing.\n- **Impact**: Breaks.\n- **Suggestion**: Fix it.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n\n- [Fixer] Fixed it.\n`,
    );

    const { ui } = mockUi();
    const fixerTasks: string[] = [];
    const reviewerPrompts: string[] = [];
    const result = await runEffect(
      runGraph(
        testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: false, reviewFile, config }),
        {
          verifySkill: () => Effect.succeed(undefined),
          runAgent: (options) => {
            fixerTasks.push(options.task);
            return Effect.succeed({ text: 'ok', error: undefined });
          },
          createPersistentAgent: () =>
            Effect.succeed(fakeAgentFor(reviewFile, canonical, reviewerPrompts)),
        },
      ),
    );

    // The checkpoint was merged without re-dispatching a fixer…
    expect(fixerTasks).toHaveLength(0);
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Recovered 1 fixer checkpoint(s) (F1)'),
      'info',
    );
    // …the reviewers were not re-run (resume jumped straight into the fixer)…
    expect(reviewerPrompts).toHaveLength(0);
    // …and the canonical reflects the recovered block.
    const final = fs.readFileSync(reviewFile, 'utf8');
    expect(final).toContain('Status**: In Review');
    // maxCycles=1 headless → the per-loop cycle cap.
    expect(result.terminal).toBe('maxLoops');
  }));

test('runGraph: resume at the fixer phase re-dispatches failed findings with prior failure context', () =>
  withReviewDir(async (dir, reviewFile) => {
    // phase 'reviewed' + a stub scratch (no Status field) + a failure record:
    // the stub must NOT be recovered (it would clobber the canonical); the
    // finding is re-dispatched with the prior failure reason + partial scratch
    // as hand-off context.
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;
    fs.writeFileSync(reviewFile, canonical);

    const config = { ...defaultLoopConfig(), maxLoops: 1, maxCycles: 1 };
    const state = {
      ...emptyLoopState(['generic']),
      loop: 0,
      cycle: 1,
      config,
      phase: 'reviewed' as const,
    };
    fs.mkdirSync(path.join(dir.tmp, '.agents/reviews/adversarial/001'), { recursive: true });
    fs.writeFileSync(
      path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json'),
      JSON.stringify(state, null, 2),
    );

    // A prior fixer attempt failed: failure record + partial scratch survive.
    const fixesDir = path.join(dir.tmp, '.agents/reviews/adversarial/001/passes/1/1/fixes');
    fs.mkdirSync(fixesDir, { recursive: true });
    fs.writeFileSync(
      path.join(fixesDir, 'F1.error.json'),
      JSON.stringify({
        findingId: 'F1',
        loop: 1,
        cycle: 1,
        kind: 'timeout',
        reason: 'm — Agent run timed out after 900000ms',
        at: 'x',
      }),
    );
    fs.writeFileSync(path.join(fixesDir, 'F1.md'), '#### F1 — partial write\n');

    const { ui } = mockUi();
    const fixerTasks: string[] = [];
    const result = await runEffect(
      runGraph(
        testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: false, reviewFile, config }),
        {
          verifySkill: () => Effect.succeed(undefined),
          runAgent: (options) => {
            fixerTasks.push(options.task);
            return Effect.succeed({ text: 'ok', error: undefined });
          },
          createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
        },
      ),
    );

    // The finding was re-dispatched until the attempt budget ran out (the
    // stub was NOT recovered)…
    expect(fixerTasks).toHaveLength(3);
    // The FIRST dispatch carries the pre-seeded failure record (the original
    // timeout) + partial scratch as hand-off context…
    expect(fixerTasks[0]).toContain('Prior attempt note');
    expect(fixerTasks[0]).toContain('Agent run timed out after');
    expect(fixerTasks[0]).toContain('Prior scratch content');
    // …and every later re-dispatch carries the LATEST attempt's failure
    // (the record is overwritten per attempt: scratch-unparseable).
    expect(fixerTasks[1]).toContain('Prior attempt note');
    expect(fixerTasks[1]).toContain('scratch-unparseable');
    expect(fixerTasks[2]).toContain('Prior attempt note');
    // It failed again (the stub is not a valid block) → per-finding warning…
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Fixer for F1: scratch at'),
      'warning',
    );
    // …and after every attempt escalates to a human — never resumes.
    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Fixer phase failed: F1 could not be fixed after 3 attempt(s)'),
      'error',
    );
    // The canonical was NOT clobbered by the stub: F1 stays Open.
    const final = fs.readFileSync(reviewFile, 'utf8');
    expect(final).toContain('Status**: Open');
  }));

test('runGraph: two consecutive fully-failed fixer waves escalate to human with per-finding reasons', () =>
  withReviewDir(async (dir, reviewFile) => {
    // F1+F2 share a file (sequential waves), F3 is another file. Both waves
    // fully fail → 2 consecutive wave failures → escalate. A single failing
    // finding in one wave must NOT count as a strike per finding (F20).
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

#### F2 — Bug two
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Other thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

#### F3 — Bug three
- **Severity**: Minor
- **Location**: \`src/b.ts\`
- **Problem**: Another thing.
- **Impact**: Meh.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 3
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const fixerTasks: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options) => {
          // Fixer runs but never writes its scratch block — every finding fails.
          fixerTasks.push(options.task);
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
      }),
    );

    // Wave 1 is [F1, F3]; each finding is re-dispatched through its full
    // attempt budget before the phase can proceed — 2 findings × 3 attempts.
    expect(fixerTasks).toHaveLength(6);
    // Per-finding warnings fire for ALL failed findings, not just the first.
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Fixer for F3: finished but wrote no scratch block'),
      'warning',
    );
    // Findings that still produced no block after every attempt escalate — the
    // phase NEVER resumes with a failed finding (F2's wave never even runs).
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining(
        'Fixer phase failed: F1, F3 could not be fixed after 3 attempt(s) across all configured models',
      ),
      'error',
    );
    expect(result.terminal).toBe('failed');
    // Every failed finding got a failure record next to its scratch.
    for (const id of ['F1', 'F3']) {
      expect(
        fs.existsSync(
          path.join(dir.tmp, '.agents/reviews/adversarial/001/passes/1/1/fixes', `${id}.error.json`),
        ),
      ).toBe(true);
    }
  }));

test('runGraph: a rate-limited fixer falls back to the configured fallback model', () =>
  withReviewDir(async (dir, reviewFile) => {
    // The fixer's primary model is rate-limited; the fallback model must be
    // tried and its valid scratch merged. NO_RETRY avoids backoff sleeps.
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;
    const config = {
      ...defaultLoopConfig(),
      maxLoops: 1,
      maxCycles: 1,
      fixerModel: 'fixer-primary',
      fixerFallbackModels: ['fixer-fallback'],
    };
    const { ui } = mockUi();
    const fixerModels: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        retryPolicy: { maxRetries: 0, baseDelayMs: 0 },
        runAgent: (options) => {
          fixerModels.push(options.model);
          if (options.model === 'fixer-primary') {
            return Effect.succeed({ text: '', error: '429 Too Many Requests — rate limit' });
          }
          // Fallback: fix the finding by writing its updated block.
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/a.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
      }),
    );

    // Both models were tried, in order: primary then fallback.
    expect(fixerModels).toEqual(['fixer-primary', 'fixer-fallback']);
    // The fallback's scratch was merged — the finding is In Review, not Open.
    const final = fs.readFileSync(reviewFile, 'utf8');
    expect(final).toContain('Status**: In Review');
    expect(final).not.toContain('Status**: Open');
    expect(result.terminal).toBe('maxLoops');
  }));

test('runGraph: a failing reviewer is retried IN-PASS with its fallback model', () =>
  withReviewDir(async (dir, reviewFile) => {
    // The reviewer's primary model fails (rate limit); the reviewer must
    // complete before the pass may proceed, so it is retried IN-PASS: the
    // session is dropped and recreated with the fallback model, which writes
    // the scratch → aggregate runs → consensus → done. No full pass retry.
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const config = {
      ...defaultLoopConfig(),
      maxLoops: 1,
      reviewers: [
        {
          ...defaultLoopConfig().reviewers[0]!,
          model: 'reviewer-primary',
          fallbackModels: ['reviewer-fallback'],
        },
      ],
    };
    const { ui } = mockUi();
    const createdModels: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        retryPolicy: { maxRetries: 0, baseDelayMs: 0 },
        createPersistentAgent: (options) => {
          createdModels.push(options.model);
          return Effect.succeed({
            prompt: (task: string) => {
              const brief = task.match(/Write the pass brief to: (\S+)/)?.[1];
              if (brief !== undefined) {
                fs.mkdirSync(path.dirname(brief), { recursive: true });
                fs.writeFileSync(brief, '# Pass brief\n');
                return Effect.succeed({ text: 'ok', error: undefined });
              }
              if (task.includes('AGGREGATE TURN')) {
                fs.writeFileSync(reviewFile, allTerminal);
                return Effect.succeed({ text: 'ok', error: undefined });
              }
              // Reviewer turn: primary rate-limits, fallback writes scratch.
              if (options.model === 'reviewer-primary') {
                return Effect.succeed({ text: '', error: '429 Too Many Requests' });
              }
              const output = reviewerOutputPath(task);
              if (output !== undefined) {
                fs.mkdirSync(path.dirname(output), { recursive: true });
                fs.writeFileSync(output, '# Scratch\n');
              }
              return Effect.succeed({ text: 'ok', error: undefined });
            },
            dispose: () => Effect.succeed(undefined),
          });
        },
      }),
    );

    // The reviewer was recreated with the fallback model after the primary
    // failed — both within the SAME pass (no pass-level retry needed).
    expect(createdModels).toContain('reviewer-primary');
    expect(createdModels).toContain('reviewer-fallback');
    expect(result.terminal).toBe('done');
  }));

test('runGraph: a failing supervisor is recreated with its fallback model on the retry pass', () =>
  withReviewDir(async (dir, reviewFile) => {
    // The supervisor's primary model fails the brief turn (rate limit); the
    // pass retries and ensureSupervisor recreates with the fallback model,
    // which completes the review → consensus → done.
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const config = {
      ...defaultLoopConfig(),
      maxLoops: 1,
      supervisor: {
        ...defaultLoopConfig().supervisor,
        model: 'supervisor-primary',
        fallbackModels: ['supervisor-fallback'],
      },
    };
    const { ui } = mockUi();
    const createdModels: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        retryPolicy: { maxRetries: 0, baseDelayMs: 0 },
        createPersistentAgent: (options) => {
          createdModels.push(options.model);
          return Effect.succeed({
            prompt: (task: string) => {
              const brief = task.match(/Write the pass brief to: (\S+)/)?.[1];
              if (brief !== undefined) {
                // Primary model fails the brief turn (rate limit); fallback
                // writes the brief.
                if (options.model === 'supervisor-primary') {
                  return Effect.succeed({ text: '', error: '529 overloaded' });
                }
                fs.mkdirSync(path.dirname(brief), { recursive: true });
                fs.writeFileSync(brief, '# Pass brief\n');
                return Effect.succeed({ text: 'ok', error: undefined });
              }
              if (task.includes('AGGREGATE TURN')) {
                fs.writeFileSync(reviewFile, allTerminal);
                return Effect.succeed({ text: 'ok', error: undefined });
              }
              const output = reviewerOutputPath(task);
              if (output !== undefined) {
                fs.mkdirSync(path.dirname(output), { recursive: true });
                fs.writeFileSync(output, '# Scratch\n');
              }
              return Effect.succeed({ text: 'ok', error: undefined });
            },
            dispose: () => Effect.succeed(undefined),
          });
        },
      }),
    );

    // The supervisor was recreated with the fallback model after the primary
    // failed the brief turn.
    expect(createdModels).toContain('supervisor-primary');
    expect(createdModels).toContain('supervisor-fallback');
    expect(result.terminal).toBe('done');
  }));

test('runGraph: a reviewer that never completes fails the pass — no resume with a missing reviewer', () =>
  withReviewDir(async (dir, reviewFile) => {
    // Reviewer A succeeds, reviewer B fails EVERY in-pass attempt (no
    // fallbacks). The pass must NOT resume to the supervisor aggregate with a
    // missing reviewer: it counts as a failed pass, retries, and escalates
    // after consecutive failures.
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const base = defaultLoopConfig();
    const config = {
      ...base,
      maxLoops: 1,
      reviewers: [
        { ...base.reviewers[0]!, id: 'good', label: 'Good', model: 'good-model' },
        { ...base.reviewers[0]!, id: 'bad', label: 'Bad', model: 'bad-model' },
      ],
    };
    const { ui } = mockUi();
    let aggregateRuns = 0;
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        retryPolicy: { maxRetries: 0, baseDelayMs: 0 },
        createPersistentAgent: (options) =>
          Effect.succeed({
            prompt: (task: string) => {
              const brief = task.match(/Write the pass brief to: (\S+)/)?.[1];
              if (brief !== undefined) {
                fs.mkdirSync(path.dirname(brief), { recursive: true });
                fs.writeFileSync(brief, '# Pass brief\n');
                return Effect.succeed({ text: 'ok', error: undefined });
              }
              if (task.includes('AGGREGATE TURN')) {
                aggregateRuns++;
                fs.writeFileSync(reviewFile, allTerminal);
                return Effect.succeed({ text: 'ok', error: undefined });
              }
              // Reviewer turn: good writes its scratch, bad always fails.
              if (options.model === 'bad-model') {
                return Effect.succeed({ text: '', error: '400 Bad Request' });
              }
              const output = reviewerOutputPath(task);
              if (output !== undefined) {
                fs.mkdirSync(path.dirname(output), { recursive: true });
                fs.writeFileSync(output, '# Scratch\n');
              }
              return Effect.succeed({ text: 'ok', error: undefined });
            },
            dispose: () => Effect.succeed(undefined),
          }),
      }),
    );

    // The bad reviewer was retried in-pass (MAX_REVIEWER_ATTEMPTS per pass)
    // and the pass failed — the aggregate NEVER ran with a missing reviewer.
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Reviewer bad failed after 3 attempt(s)'),
      'error',
    );
    expect(aggregateRuns).toBe(0);
    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      'Reviewer failed 2 consecutive times. Escalating to human.',
      'error',
    );
  }));

test('runGraph: a pre-aborted signal stops before any agent runs', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    const controller = new AbortController();
    controller.abort();

    const result = await runEffect(
      runGraph(
        { ...testCtx(dir, ui, { maxLoops: 3, fresh: true }), signal: controller.signal },
        {
          verifySkill: () => Effect.succeed(undefined),
          runAgent: () => Effect.succeed({ text: 'ok', error: undefined }),
          createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, 'x', [])),
        },
      ),
    );

    expect(result.terminal).toBe('stopped');
  }));

test('runGraph: abort stops the fixer between waves (related findings)', () =>
  withReviewDir(async (dir, reviewFile) => {
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

#### F2 — Bug two
- **Severity**: Minor
- **Location**: \`src/a.ts\`
- **Problem**: Other thing.
- **Impact**: Meh.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 2
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const controller = new AbortController();
    const fixerTasks: string[] = [];
    const result = await runEffect(
      runGraph(
        { ...testCtx(dir, ui, { maxLoops: 3, fresh: true }), signal: controller.signal },
        {
          verifySkill: () => Effect.succeed(undefined),
          runAgent: (options, _timeoutMs) => {
            fixerTasks.push(options.task);
            // Request a stop after the first finding's fixer completes.
            controller.abort();
            return Effect.succeed({ text: 'ok', error: undefined });
          },
          createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
        },
      ),
    );

    expect(result.terminal).toBe('stopped');
    // The stop fired after F1 — F2 was never dispatched.
    expect(fixerTasks).toHaveLength(1);
    expect(fixerTasks[0]).toContain('F1');
  }));

test('runGraph: opts.reviewFile resumes the given review in place', () =>
  withReviewDir(async (dir, reviewFile) => {
    fs.writeFileSync(
      reviewFile,
      `# Review\n\n## Summary\n- **Open**: 1\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 0\n- **Won't Fix**: 0\n`,
    );
    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: false, reviewFile }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, '# Review\n', [])),
      }),
    );

    // The graph re-reviewed the exact file (not a fresh code) in place.
    expect(result.reviewFile).toBe(reviewFile);
    expect(result.reReview).toBe(true);
  }));

test('runGraph: opts.reviewFile escaping .agents/reviews/ fails the loop', async () => {
  const dir = withProjectRoot({});
  try {
    const outside = path.join(dir.tmp, 'escape', '001.md');
    fs.mkdirSync(path.dirname(outside), { recursive: true });
    fs.writeFileSync(outside, '# Review\n');
    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: false, reviewFile: outside }), {
        verifySkill: () => Effect.succeed(undefined),
      }),
    );
    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('escapes .agents/reviews'),
      'error',
    );
    // No state/scratch dirs may be created outside the reviews root.
    expect(fs.existsSync(path.join(dir.tmp, 'escape', '001'))).toBe(false);
  } finally {
    dir.cleanup();
  }
});

test('runGraph: opts.reviewFile escaping via a symlink under .agents/reviews/ fails the loop', async () => {
  const dir = withProjectRoot({});
  try {
    // `.agents/reviews/link` → outside dir; the review file does not exist
    // yet (ensureStateDirs would create it), so realpath of the full path is
    // ENOENT — the deepest existing ancestor (`link`) must still be resolved
    // to catch the escape.
    const reviews = path.join(dir.tmp, '.agents/reviews');
    fs.mkdirSync(reviews, { recursive: true });
    const outside = path.join(dir.tmp, 'outside');
    fs.mkdirSync(outside, { recursive: true });
    fs.symlinkSync(outside, path.join(reviews, 'link'), 'dir');
    const reviewFile = path.join(reviews, 'link', '001.md');
    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: false, reviewFile }), {
        verifySkill: () => Effect.succeed(undefined),
      }),
    );
    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('escapes .agents/reviews'),
      'error',
    );
    // Nothing may be created through the symlink outside the reviews root.
    expect(fs.existsSync(path.join(outside, '001'))).toBe(false);
    expect(fs.existsSync(path.join(outside, 'scratch'))).toBe(false);
  } finally {
    dir.cleanup();
  }
});

test('runGraph: advancing to the next loop disposes the previous loop sessions', () =>
  withReviewDir(async (dir, reviewFile) => {
    // Consensus in loop 1 → the orchestrator must dispose loop 1's reviewer +
    // supervisor sessions before spawning loop 2's fresh independent set.
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const { ui } = mockUi();
    const factory = fakeAgentFactory(reviewFile, allTerminal);

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 2, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(factory.create()),
      }),
    );

    expect(result.terminal).toBe('done');
    // Loop 1: reviewer (create #1) + supervisor (#2) — both disposed at the
    // advance. Loop 2: reviewer (#3) + supervisor (#4) — disposed at exit.
    expect(factory.disposals).toContain(1);
    expect(factory.disposals).toContain(2);
  }));

test('runGraph: fresh runs lock the config (loops + cycles) into loop-state', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 4, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, '# Review\n', [])),
      }),
    );

    const statePath = path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as {
      config?: { maxLoops?: number; maxCycles?: number; fixerModel?: string };
    };
    expect(state.config).toBeDefined();
    expect(state.config?.maxLoops).toBe(1);
    expect(state.config?.maxCycles).toBe(4);
    expect(state.config?.fixerModel).toBe('f');
  }));

test('runGraph: consecutive reviewer failures escalate to human', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    const factory = fakeAgentFactory(reviewFile, 'irrelevant', {
      reviewerError: 'model exploded',
    });
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 5, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(factory.create()),
      }),
    );

    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      'Reviewer failed 2 consecutive times. Escalating to human.',
      'error',
    );
  }));

test('runGraph: supervisor aggregate failure retries then escalates', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    // Every session writes the brief but never the canonical → aggregate fails.
    const factory = fakeAgentFactory(reviewFile, '');
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 5, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(factory.create()),
      }),
    );

    expect(result.terminal).toBe('failed');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Supervisor aggregate failed'),
      'error',
    );
  }));

test('runGraph: a timed-out supervisor turn is disposed and recreated, not re-prompted', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    // Created #1 = loop reviewer (succeeds). Created #2 = the loop's supervisor,
    // which times out on the brief turn (timedOut marker set, no brief written).
    // The caller must dispose it and recreate a fresh session for the retry —
    // re-prompting the busy one would hit pi's "already processing a prompt"
    // busy error and cascade to failure.
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const factory = fakeAgentFactory(reviewFile, allTerminal, { timeoutBriefOnCreate: 2 });

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(factory.create()),
      }),
    );

    // The timed-out supervisor was disposed (never re-prompted), a fresh one
    // was created, and the retried pass completed → done. No busy-session
    // cascade.
    expect(factory.disposals).toContain(2);
    expect(result.terminal).toBe('done');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Supervisor brief timed out after'),
      'error',
    );
  }));

test('runGraph: supervisor timeout is configurable and reported in human units', () =>
  withReviewDir(async (dir, reviewFile) => {
    const { ui } = mockUi();
    // Custom 15-minute supervisor budget — the timeout notification must
    // echo it as `15 minutes`, not raw milliseconds.
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const factory = fakeAgentFactory(reviewFile, allTerminal, { timeoutBriefOnCreate: 2 });
    const config = { ...defaultLoopConfig(), supervisorTimeoutMs: 900000 };

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(factory.create()),
      }),
    );

    // The retried pass still completed (fresh session created after dispose).
    expect(factory.disposals).toContain(2);
    expect(result.terminal).toBe('done');
    expect(ui.notify).toHaveBeenCalledWith(
      expect.stringContaining('Supervisor brief timed out after 15 minutes'),
      'error',
    );
  }));

test('runGraph: early exit when the LAST loop is all-terminal on resume', () =>
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
    // Loop-state says we are at loop 3 of 3 (0-based loop 2) with consensus —
    // nothing left to do.
    await runEffect(
      saveLoopState(reviewFile, {
        ...emptyLoopState(['generic']),
        loop: 2,
        config: defaultLoopConfig(),
      }),
    );
    const { ui } = mockUi();
    const createPersistentAgent = vi.fn();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: false, reviewFile }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent,
      }),
    );
    expect(result.terminal).toBe('done');
    expect(createPersistentAgent).not.toHaveBeenCalled();
  }));

test('runGraph: resuming an all-terminal review at an earlier loop advances to the next loop', () =>
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
    // Loop-state says loop 1 of 3 reached consensus but the run stopped before
    // advancing — resume must spawn loop 2's reviewers, not declare victory.
    await runEffect(
      saveLoopState(reviewFile, {
        ...emptyLoopState(['generic']),
        loop: 0,
        config: { ...defaultLoopConfig(), maxLoops: 3 },
      }),
    );
    const { ui } = mockUi();
    const prompts: string[] = [];
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 3, fresh: false, reviewFile }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, '# Review\n', prompts)),
      }),
    );

    // Loop 2 (and loop 3) ran with fresh reviewers; final consensus ends done.
    expect(result.terminal).toBe('done');
    expect(prompts.length).toBeGreaterThanOrEqual(2);
    const statePath = path.join(dir.tmp, '.agents/reviews/adversarial/001/loop-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8')) as { loop?: number };
    expect(state.loop).toBe(2);
  }));

test('runGraph: the supervisor brief carries the user directive as authoritative intent', () =>
  withReviewDir(async (dir, reviewFile) => {
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const { ui } = mockUi();
    const prompts: string[] = [];
    const result = await runEffect(
      runGraph(
        testCtx(dir, ui, {
          maxLoops: 1,
          fresh: true,
          directive: 'check the import feature',
        }),
        {
          verifySkill: () => Effect.succeed(undefined),
          createPersistentAgent: () =>
            Effect.succeed(fakeAgentFor(reviewFile, allTerminal, prompts)),
        },
      ),
    );

    expect(result.terminal).toBe('done');
    // The brief turn (and only the brief turn) receives the directive as the
    // pass's authoritative intent, plus the locate-the-code instruction.
    const briefTask = prompts.find((task) => task.includes('BRIEF TURN'));
    expect(briefTask).toBeDefined();
    expect(briefTask).toContain(
      'USER DIRECTIVE — the authoritative intent for this pass: check the import feature',
    );
    expect(briefTask).toContain('treat it as authoritative');
    expect(briefTask).toContain('locate it yourself with read/grep/glob');
  }));

/**
 * Fake persistent agent that emits live text deltas on every prompt (via the
 * prompt's onDelta callback) before dispatching on task content.
 */
const streamingAgent = (
  reviewFile: string,
  canonical: string,
  prompts: string[],
): {
  prompt: (
    task: string,
    _timeoutMs?: number,
    _onTool?: unknown,
    onDelta?: (delta: string, kind: 'text' | 'thinking') => void,
  ) => Effect.Effect<{ text: string; error: string | undefined; timedOut?: boolean }>;
  dispose: () => Effect.Effect<void>;
} => ({
  prompt: (task: string, _timeoutMs?: number, _onTool?: unknown, onDelta?) => {
    prompts.push(task);
    onDelta?.('streaming ', 'text');
    onDelta?.('reply', 'text');
    const brief = task.match(/Write the pass brief to: (\S+)/)?.[1];
    if (brief !== undefined) {
      fs.mkdirSync(path.dirname(brief), { recursive: true });
      fs.writeFileSync(brief, '# Pass brief — cycle\n\nScope: review src/.\n');
      return Effect.succeed({ text: 'ok', error: undefined });
    }
    if (task.includes('AGGREGATE TURN')) {
      fs.writeFileSync(reviewFile, canonical);
      return Effect.succeed({ text: 'ok', error: undefined });
    }
    const output = reviewerOutputPath(task);
    if (output !== undefined) {
      fs.mkdirSync(path.dirname(output), { recursive: true });
      fs.writeFileSync(output, '# Scratch\n');
    }
    return Effect.succeed({ text: 'ok', error: undefined });
  },
  dispose: () => Effect.succeed(undefined),
});

test('runGraph: agent text deltas land in the shared stream store', () =>
  withReviewDir(async (dir, reviewFile) => {
    const allTerminal = `# Review\n\n## Summary\n- **Open**: 0\n- **In Review**: 0\n- **Escalated**: 0\n- **Resolved**: 1\n- **Won't Fix**: 0\n`;
    const { ui } = mockUi();
    const prompts: string[] = [];

    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        createPersistentAgent: () =>
          Effect.succeed(streamingAgent(reviewFile, allTerminal, prompts)),
      }),
    );

    expect(result.terminal).toBe('done');
    // The supervisor was prompted twice (brief + aggregate) and the reviewer
    // once — every turn's deltas were appended to the shared store.
    expect(result.streams?.get('supervisor')?.text).toBe('streaming replystreaming reply');
    expect(result.streams?.get('reviewer:generic')?.text).toBe('streaming reply');
  }));

test('runGraph: fixer node publishes per-fixer rows, schedule diagram, and live tools', () =>
  withReviewDir(async (dir, reviewFile) => {
    // F1 + F2 in different files → same wave; F3 in F1's file → wave 2.
    const canonical = `# Review

## Review Metadata
- **Max Attempts**: 3

## Findings

#### F1 — Bug one
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

#### F2 — Bug two
- **Severity**: Minor
- **Location**: \`src/b.ts\`
- **Problem**: Other thing.
- **Impact**: Meh.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

#### F3 — Bug three
- **Severity**: Minor
- **Location**: \`src/a.ts\`
- **Problem**: Third thing.
- **Impact**: Meh.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 3
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;

    const { ui } = mockUi();
    const result = await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true }), {
        verifySkill: () => Effect.succeed(undefined),
        runAgent: (options, _timeoutMs) => {
          // Simulate live tool activity per fixer, then write the scratch block.
          options.onTool?.({ kind: 'start', tool: 'read' });
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/x.ts\`\n- **Problem**: x.\n- **Impact**: y.\n- **Suggestion**: z.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
        createPersistentAgent: () => Effect.succeed(fakeAgentFor(reviewFile, canonical, [])),
      }),
    );

    expect(result.terminal).toBe('maxLoops'); // maxCycles=1, headless
    const widget = result.widget;
    expect(widget?.fixerSchedule).toEqual([['F1', 'F2'], ['F3']]);
    expect(widget?.fixerWave).toBe(2);
    // Every finding was fixed → all rows done (queued/running only during waves).
    expect(widget?.fixers?.map((row) => row.id)).toEqual(['F1', 'F2', 'F3']);
    expect(widget?.fixers?.every((row) => row.status === 'done')).toBe(true);
    // Live per-fixer tools were recorded during the runs.
    expect(widget?.fixerActivity?.getTool('F1')).toBe('read');
    expect(widget?.fixerActivity?.getTool('F2')).toBe('read');
    expect(widget?.fixerActivity?.getTool('F3')).toBe('read');
  }));

test('runGraph: reports working → idle to herdr when running inside a herdr pane', () =>
  withReviewDir(async (dir, reviewFile) => {
    // A fake herdr server: collects pane.report_agent requests and acks them.
    const socketPath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'herdr-graph-')),
      'herdr.sock',
    );
    const received: Array<{ params: Record<string, unknown> }> = [];
    const server = net.createServer((socket) => {
      socket.on('data', (data) => {
        for (const line of data.toString().split('\n')) {
          if (line.trim() !== '') received.push(JSON.parse(line));
        }
        socket.write('{"ok":true}\n');
      });
    });
    await new Promise<void>((resolve) => server.listen(socketPath, resolve));

    process.env.HERDR_ENV = '1';
    process.env.HERDR_SOCKET_PATH = socketPath;
    process.env.HERDR_PANE_ID = 'w24:p2';
    try {
      const { ui } = mockUi();
      await runEffect(
        runGraph(testCtx(dir, ui, { maxLoops: 1, fresh: true }), {
          verifySkill: () => Effect.succeed(undefined),
          createPersistentAgent: () =>
            Effect.succeed(fakeAgentFor(reviewFile, '# Review\n', [])),
        }),
      );
    } finally {
      delete process.env.HERDR_ENV;
      delete process.env.HERDR_SOCKET_PATH;
      delete process.env.HERDR_PANE_ID;
      await new Promise<void>((resolve) => server.close(() => resolve()));
      fs.rmSync(path.dirname(socketPath), { recursive: true, force: true });
    }

    // The pane saw `working` for the whole run and `idle` exactly at the end.
    const states = received.map((request) => request.params.state);
    expect(states[0]).toBe('working');
    expect(states[states.length - 1]).toBe('idle');
    expect(states.filter((state) => state === 'idle')).toHaveLength(1);
    // The working report carries the loop/phase detail.
    expect(String(received[0]?.params.message)).toContain('[loop 1/1');
  }));

test('runGraph: configured thinking levels reach supervisor, reviewer, and fixer sessions', () =>
  withReviewDir(async (dir, reviewFile) => {
    // Every role pins a different thinking level; the run must forward each
    // to its session-creation options (the fixer goes through runAgent, the
    // supervisor + reviewer through createPersistentAgent).
    const canonical = `# Review

## Findings

### Major

#### F1 — Bug
- **Severity**: Major
- **Location**: \`src/a.ts\`
- **Problem**: Wrong thing.
- **Impact**: Breaks.
- **Suggestion**: Fix it.
- **Status**: Open
- **Attempts**: 0
- **First Seen**: 1

### Discussion

## Summary
- **Open**: 1
- **In Review**: 0
- **Escalated**: 0
- **Resolved**: 0
- **Won't Fix**: 0
`;
    const base = defaultLoopConfig();
    const generic =
      base.reviewers[0] ?? {
        id: 'generic',
        label: 'Generic',
        model: 'r',
        skillPath: '',
        objective: 'full',
        focus: 'full',
      };
    const config = {
      ...base,
      maxLoops: 1,
      maxCycles: 1,
      reviewers: [{ ...generic, model: 'reviewer-model', thinkingLevel: 'high' as const }],
      supervisor: {
        ...base.supervisor,
        model: 'supervisor-model',
        thinkingLevel: 'xhigh' as const,
      },
      fixerModel: 'fixer-model',
      fixerThinkingLevel: 'low' as const,
    };
    const { ui } = mockUi();
    const persistentOptions: Array<{ model: string; thinkingLevel?: string }> = [];
    const runOptions: Array<{ model: string; thinkingLevel?: string }> = [];
    await runEffect(
      runGraph(testCtx(dir, ui, { maxLoops: 1, maxCycles: 1, fresh: true, config }), {
        verifySkill: () => Effect.succeed(undefined),
        retryPolicy: { maxRetries: 0, baseDelayMs: 0 },
        createPersistentAgent: (options) => {
          persistentOptions.push({ model: options.model, thinkingLevel: options.thinkingLevel });
          return Effect.succeed(
            fakeAgentFor(reviewFile, canonical, []),
          );
        },
        runAgent: (options) => {
          runOptions.push({ model: options.model, thinkingLevel: options.thinkingLevel });
          const scratch = options.task.match(/scratch file at (\S+\.md)/)?.[1];
          const id = options.task.match(/\b(F\d+)\b/)?.[1];
          if (scratch !== undefined && id !== undefined) {
            fs.mkdirSync(path.dirname(scratch), { recursive: true });
            fs.writeFileSync(
              scratch,
              `#### ${id} — Fixed\n- **Severity**: Major\n- **Location**: \`src/a.ts\`\n- **Problem**: Wrong thing.\n- **Impact**: Breaks.\n- **Suggestion**: Fix it.\n- **Status**: In Review\n- **Attempts**: 1\n- **First Seen**: 1\n\n### Discussion\n`,
            );
          }
          return Effect.succeed({ text: 'ok', error: undefined });
        },
      }),
    );

    // Supervisor (xhigh) and reviewer (high) each got their own level.
    expect(
      persistentOptions.find((options) => options.model === 'supervisor-model')?.thinkingLevel,
    ).toBe('xhigh');
    expect(
      persistentOptions.find((options) => options.model === 'reviewer-model')?.thinkingLevel,
    ).toBe('high');
    // The fixer run got the loop-level fixer thinking level.
    expect(runOptions.find((options) => options.model === 'fixer-model')?.thinkingLevel).toBe(
      'low',
    );
  }));
