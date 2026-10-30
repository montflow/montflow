import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '@montflow/prompts';
import { Cause, Effect, FileSystem, Layer, Path } from 'effect';
import { runDoctor } from '../../../modules/doctor/index.js';
import { PromptError } from '../../../modules/prompt/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  author,
  diagnoseCause,
  execute,
  type ExecuteOptions,
  sizingConfig,
  type SizingConfigOptions,
  storeDirOf,
  DEFAULT_ROOT,
  SurfaceError,
} from '../index.js';

/**
 * `author` and `execute` render the shipped prompts from real derived state.
 * Every test uses a throwaway workspace so the repo prompt store is never the
 * fixture, and none of these effects has a model or session port: the binary
 * can render but cannot dispatch.
 */

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const StoreLive = Layer.mergeAll(
  Layer.provide(SpecStore.Default, Platform),
  Layer.provide(PromptStore.Default, Platform),
  Platform,
);

/** Wrap the real store so a test can count snapshot/config/review reads. */
const makeCountingLayer = (counters: {
  snapshot: number;
  readRootFile: number;
  reviewSeries: number;
}) =>
  Layer.provide(
    Layer.effect(
      SpecStore.SpecStore,
      Effect.gen(function* () {
        const real = yield* SpecStore.SpecStore;
        return {
          ...real,
          snapshot: (root: string, name: string) => {
            counters.snapshot += 1;
            return real.snapshot(root, name);
          },
          readRootFile: (root: string, name: string) => {
            counters.readRootFile += 1;
            return real.readRootFile(root, name);
          },
          reviewSeries: (root: string, name: string) => {
            counters.reviewSeries += 1;
            return real.reviewSeries(root, name);
          },
        };
      }),
    ),
    Layer.provide(SpecStore.Default, Platform),
  );

/** A throwaway workspace with its specs root. */
interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  /** Workspace root that owns `.agents/` and `.git`. */
  readonly dir: string;
  /** `<dir>/.agents/@montflow/specs`. */
  readonly root: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-author-execute-' });
  const root = path.join(dir, DEFAULT_ROOT);
  yield* fs.makeDirectory(root, { recursive: true });
  return { fs, path, dir, root };
});

/** Write one spec directory from relative path -> contents. */
const seed = (work: Work, name: string, files: ReadonlyArray<readonly [string, string]>) =>
  Effect.gen(function* () {
    const base = work.path.join(work.root, name);
    yield* work.fs.makeDirectory(base, { recursive: true });
    for (const [relative, content] of files) {
      const target = work.path.join(base, relative);
      yield* work.fs.makeDirectory(work.path.dirname(target), { recursive: true });
      yield* work.fs.writeFileString(target, content);
    }
  });

/** A complete, valid phase A: one sized task plus its review task. */
const phaseA = (
  spec: string,
  size: string,
  status = 'pending',
): ReadonlyArray<readonly [string, string]> => [
  ['SPEC.md', specMarkdown({ name: spec })],
  [
    'A001-implement-login/TASK.md',
    taskMarkdown({ id: 'A001', name: 'implement-login', size, status }),
  ],
  ['A001-implement-login/MEMORY.md', memoryMarkdown()],
  [
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'pending' }),
  ],
  ['A099-review-phase/MEMORY.md', memoryMarkdown()],
];

/** Write `count` review rounds attributed to `phase` for `series`. */
const seedRounds = (work: Work, series: string, count: number, phase = 'A') =>
  Effect.gen(function* () {
    for (let index = 1; index <= count; index++) {
      const round = String(index).padStart(3, '0');
      const dir = work.path.join(work.dir, '.agents', '@montflow', 'reviews', series, round);
      yield* work.fs.makeDirectory(dir, { recursive: true });
      yield* work.fs.writeFileString(
        work.path.join(dir, 'REVIEW.md'),
        `# Review: ${series} / ${round}\n\n## Metadata\n\n- Round: ${round}\n- Phase: ${phase}\n\n## Findings\n\nNone.\n`,
      );
    }
  });

/** A three-phase spec: A locked and complete, B active, C still ahead. */
const multiPhase = (spec: string): ReadonlyArray<readonly [string, string]> => [
  [
    'SPEC.md',
    specMarkdown({
      name: spec,
      lockedPhases: 'A',
      rows: [
        { id: 'A001', name: 'old-work', type: 'execution', status: 'complete', gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: 'complete', gates: 'No' },
        { id: 'B001', name: 'work-now', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'B099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
        { id: 'C001', name: 'work-later', type: 'execution', status: 'pending', gates: 'No' },
        { id: 'C099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
      ],
    }),
  ],
  [
    'A001-old-work/TASK.md',
    taskMarkdown({
      id: 'A001',
      name: 'old-work',
      size: 'small',
      status: 'complete',
    }),
  ],
  ['A001-old-work/MEMORY.md', memoryMarkdown()],
  [
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'complete' }),
  ],
  ['A099-review-phase/MEMORY.md', memoryMarkdown()],
  ['B001-work-now/TASK.md', taskMarkdown({ id: 'B001', name: 'work-now', size: 'small' })],
  ['B001-work-now/MEMORY.md', memoryMarkdown()],
  ['B099-review-phase/TASK.md', taskMarkdown({ id: 'B099', name: 'review-phase', type: 'review' })],
  ['B099-review-phase/MEMORY.md', memoryMarkdown()],
  ['C001-work-later/TASK.md', taskMarkdown({ id: 'C001', name: 'work-later', size: 'small' })],
  ['C001-work-later/MEMORY.md', memoryMarkdown()],
  ['C099-review-phase/TASK.md', taskMarkdown({ id: 'C099', name: 'review-phase', type: 'review' })],
  ['C099-review-phase/MEMORY.md', memoryMarkdown()],
];

/**
 * A complete spec: every task complete and every phase locked. `execute` must
 * refuse it rather than render a dispatchable session.
 */
const completeSpec = (spec: string): ReadonlyArray<readonly [string, string]> => [
  [
    'SPEC.md',
    specMarkdown({
      name: spec,
      status: 'complete',
      lockedPhases: 'A',
      rows: [
        { id: 'A001', name: 'implement-login', type: 'execution', status: 'complete', gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: 'complete', gates: 'No' },
      ],
    }),
  ],
  [
    'A001-implement-login/TASK.md',
    taskMarkdown({
      id: 'A001',
      name: 'implement-login',
      size: 'small',
      status: 'complete',
    }),
  ],
  ['A001-implement-login/MEMORY.md', memoryMarkdown()],
  [
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'complete' }),
  ],
  ['A099-review-phase/MEMORY.md', memoryMarkdown()],
];

/** A `check`-clean phase whose only non-review task is complete without a size. */
const completeUnsizedPhase = (spec: string): ReadonlyArray<readonly [string, string]> => [
  [
    'SPEC.md',
    specMarkdown({
      name: spec,
      rows: [
        { id: 'A001', name: 'historical-work', type: 'execution', status: 'complete', gates: 'No' },
        { id: 'A099', name: 'review-phase', type: 'review', status: 'pending', gates: 'No' },
      ],
    }),
  ],
  [
    'A001-historical-work/TASK.md',
    taskMarkdown({
      id: 'A001',
      name: 'historical-work',
      status: 'complete',
      withoutSize: true,
    }),
  ],
  ['A001-historical-work/MEMORY.md', memoryMarkdown()],
  ['A099-review-phase/TASK.md', taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' })],
  ['A099-review-phase/MEMORY.md', memoryMarkdown()],
];

/** The two review skills the execution prompt declares but doctor does not own. */
const REVIEW_SKILLS = [
  'montflow-adversarial-review',
  'montflow-addressing-adversarial-review',
] as const;

/** Install the declared review skills the way another package would. */
const installReviewSkills = (work: Work) =>
  Effect.gen(function* () {
    for (const name of REVIEW_SKILLS) {
      const dir = work.path.join(work.dir, '.agents', 'skills', name);
      yield* work.fs.makeDirectory(dir, { recursive: true });
      yield* work.fs.writeFileString(
        work.path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
  });

/** Doctor plus the review skills, so a successfully rendered execute is dispatchable. */
const preparePrompts = (work: Work) =>
  Effect.gen(function* () {
    yield* runDoctor(work.dir);
    yield* installReviewSkills(work);
  });

/** Point `<dir>/.git/HEAD` at a branch ref. */
const branch = (work: Work, name: string) =>
  Effect.gen(function* () {
    const git = work.path.join(work.dir, '.git');
    yield* work.fs.makeDirectory(git, { recursive: true });
    yield* work.fs.writeFileString(work.path.join(git, 'HEAD'), `ref: refs/heads/${name}\n`);
  });

const runAuthor = (work: Work, options: { request: string; notes?: string }) =>
  author(work.dir, options).pipe(Effect.provide(StoreLive));

const runExecute = (work: Work, options: ExecuteOptions = {}) =>
  execute(storeDirOf(work.dir), { workspace: work.dir, ...options }).pipe(
    Effect.provide(StoreLive),
  );

const runSizing = (work: Work, options: SizingConfigOptions = {}) =>
  sizingConfig(work.dir, options).pipe(Effect.provide(StoreLive));

const diagnose = (error: PromptError | SurfaceError | SpecStore.StoreError): string =>
  diagnoseCause(Cause.fail(error), {
    path: 'specs',
    rerun: 'mf-specs execute',
    verbose: false,
  }).output;

Vitest.describe('Cli.author runtime', () => {
  Vitest.it.effect('renders spec-create with the request and its declared skill', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* runDoctor(work.dir);

      const loaded = yield* runAuthor(work, { request: 'Ship login' });
      Vitest.expect(loaded.name).toBe('spec-create');
      Vitest.expect(loaded.text).toContain('Ship login');
      Vitest.expect(loaded.text).toContain('## 4. Size every task');
      Vitest.expect(loaded.skills).toStrictEqual(['montflow-create-specs']);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('carries optional notes only when supplied', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* runDoctor(work.dir);

      const plain = yield* runAuthor(work, { request: 'Ship login' });
      Vitest.expect(plain.text).not.toContain('Extra constraints');

      const noted = yield* runAuthor(work, {
        request: 'Ship login',
        notes: 'Do not touch packages/core.',
      });
      Vitest.expect(noted.text).toContain('Extra constraints');
      Vitest.expect(noted.text).toContain('Do not touch packages/core.');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a stale prompt with the doctor repair', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* runDoctor(work.dir);
      yield* work.fs.writeFileString(
        work.path.join(work.dir, '.agents', '@montflow', 'prompts', 'spec-create.json'),
        '{"name":"spec-create"}\n',
      );

      const error = yield* runAuthor(work, { request: 'Ship login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.stale');
      Vitest.expect(text).toContain('fix      Run mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a missing prompt with the coded doctor gate', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const error = yield* runAuthor(work, { request: 'Ship login' }).pipe(Effect.flip);
      const report = diagnose(error);
      Vitest.expect(report).toContain('code     prompt.missing');
      Vitest.expect(report).toContain('not installed');
      Vitest.expect(report).toContain('fix      Run mf-specs doctor');
      Vitest.expect(report).toContain('next     mf-specs execute');
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('Cli.execute runtime', () => {
  Vitest.it.effect(
    'renders state, ready set, and the tiny-only phase budget by explicit name',
    () =>
      Effect.gen(function* () {
        const work = yield* prepare;
        yield* seed(work, 'ship-login', phaseA('ship-login', 'tiny'));
        yield* preparePrompts(work);

        const report = yield* runExecute(work, { name: 'ship-login' });
        Vitest.expect(report.name).toBe('ship-login');
        Vitest.expect(report.phase).toBeUndefined();
        Vitest.expect(report.budget).toBe(1);
        Vitest.expect(report.state).toContain('phase A');
        Vitest.expect(report.next).toContain('A001');
        Vitest.expect(report.prompt.text).toContain('ship-login');
        Vitest.expect(report.prompt.text).toContain('phase A');
        Vitest.expect(report.prompt.text).toContain('budget is 1');
        Vitest.expect(report.prompt.text).toContain('Guided run (the default)');
        Vitest.expect(report.prompt.text).toContain('Re-derive them when the session starts');
        Vitest.expect(report.prompt.text).not.toContain('Work only phase');
        Vitest.expect(report.prompt.skills).toStrictEqual([
          'montflow-find-specs',
          'montflow-adversarial-review',
          'montflow-addressing-adversarial-review',
        ]);
      }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses an over-budget phase before rendering a session', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      // A tiny phase buys one review cycle; two rounds is exactly one over.
      yield* seed(work, 'ship-login', phaseA('ship-login', 'tiny'));
      yield* seedRounds(work, 'ship-login', 2);
      yield* preparePrompts(work);

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     review.budget-exceeded');
      Vitest.expect(text).toContain('2 rounds');
      Vitest.expect(text).toContain('the phase budget is 1');
      // No session is rendered, so no ready set can tell the session to work.
      Vitest.expect(text).not.toContain('Work only phase');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('resumes a spec in progress from the derived ready set', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', [
        [
          'SPEC.md',
          specMarkdown({
            name: 'ship-login',
            rows: [
              {
                id: 'A001',
                name: 'implement-login',
                type: 'execution',
                status: 'complete',
                gates: 'No',
              },
              {
                id: 'A002',
                name: 'wire-session',
                type: 'execution',
                status: 'pending',
                gates: 'No',
              },
              {
                id: 'A099',
                name: 'review-phase',
                type: 'review',
                status: 'pending',
                gates: 'No',
              },
            ],
          }),
        ],
        [
          'A001-implement-login/TASK.md',
          taskMarkdown({
            id: 'A001',
            name: 'implement-login',
            size: 'small',
            status: 'complete',
          }),
        ],
        ['A001-implement-login/MEMORY.md', memoryMarkdown()],
        [
          'A002-wire-session/TASK.md',
          taskMarkdown({ id: 'A002', name: 'wire-session', size: 'small' }),
        ],
        ['A002-wire-session/MEMORY.md', memoryMarkdown()],
        [
          'A099-review-phase/TASK.md',
          taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'pending' }),
        ],
        ['A099-review-phase/MEMORY.md', memoryMarkdown()],
      ]);
      yield* preparePrompts(work);

      const report = yield* runExecute(work, { name: 'ship-login' });
      Vitest.expect(report.budget).toBe(2);
      Vitest.expect(report.next).toContain('A002');
      Vitest.expect(report.next).not.toContain('A001');
      Vitest.expect(report.prompt.text).toContain('budget is 2');
      Vitest.expect(report.prompt.text).toContain('A002');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('passes an explicit phase through as the session limit', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);

      const report = yield* runExecute(work, { name: 'ship-login', phase: 'A' });
      Vitest.expect(report.phase).toBe('A');
      Vitest.expect(report.budget).toBe(2);
      // The ready set must describe the same phase the session is limited to.
      Vitest.expect(report.next).toContain('phase A');
      Vitest.expect(report.next).toContain('A001');
      Vitest.expect(report.prompt.text).toContain('Work only phase');
      Vitest.expect(report.prompt.text).toContain('`A`');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('treats a blank or whitespace-only --phase as absent', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);

      const omitted = yield* runExecute(work, { name: 'ship-login' });
      for (const phase of ['', '   ', '\t']) {
        const blank = yield* runExecute(work, { name: 'ship-login', phase });
        Vitest.expect(blank.phase, JSON.stringify(phase)).toBeUndefined();
        Vitest.expect(blank.state, JSON.stringify(phase)).toBe(omitted.state);
        Vitest.expect(blank.prompt.text, JSON.stringify(phase)).toBe(omitted.prompt.text);
        // The sibling verb reads the same blank value the same way.
        const sizing = yield* runSizing(work, { name: 'ship-login', phase });
        Vitest.expect(sizing.phase, JSON.stringify(phase)).toBeUndefined();
      }
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a padded --phase instead of trimming it into a valid id', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);

      for (const phase of [' A ', '\tA', 'A ']) {
        const refused = yield* runExecute(work, { name: 'ship-login', phase }).pipe(Effect.flip);
        const text = diagnose(refused);
        Vitest.expect(text, JSON.stringify(phase)).toContain('code     cli.invalid-argument');
        Vitest.expect(text, JSON.stringify(phase)).toContain('field    --phase');
        Vitest.expect(text, JSON.stringify(phase)).toContain(
          'next     mf-specs execute --name <spec> --phase <id>',
        );

        const sizing = yield* runSizing(work, { name: 'ship-login', phase }).pipe(Effect.flip);
        const sizingText = diagnose(sizing);
        Vitest.expect(sizingText, JSON.stringify(phase)).toContain('code     cli.invalid-argument');
        Vitest.expect(sizingText, JSON.stringify(phase)).toContain('field    --phase');
        Vitest.expect(sizingText, JSON.stringify(phase)).toContain(
          'next     mf-specs sizing-config --name <spec> --phase <id>',
        );
      }
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a spec config error once, naming the spec file it holds', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', [
        ...phaseA('ship-login', 'small'),
        ['sizing.json', '{ not json'],
      ]);
      yield* preparePrompts(work);

      const refused = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(refused);
      // One blocker, not the loader's copy plus the tree's copy.
      Vitest.expect(text.split('code     sizing.malformed-json')).toHaveLength(2);
      Vitest.expect(text).toContain('path     ship-login/sizing.json');
      // Never the repo config's bare path for a spec-level defect.
      Vitest.expect(text).not.toContain('path     sizing.json');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a locked phase and names the active one', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', multiPhase('ship-login'));
      yield* preparePrompts(work);

      const error = yield* runExecute(work, { name: 'ship-login', phase: 'A' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     spec.phase-not-active');
      Vitest.expect(text).toContain("Phase 'A' is not the active phase");
      Vitest.expect(text).toContain('(it is locked)');
      Vitest.expect(text).toContain('phase B');
      Vitest.expect(text).toContain('--phase B');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a future phase and renders the requested phase only', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', multiPhase('ship-login'));
      yield* preparePrompts(work);

      const future = yield* runExecute(work, { name: 'ship-login', phase: 'C' }).pipe(Effect.flip);
      const text = diagnose(future);
      Vitest.expect(text).toContain('code     spec.phase-not-active');
      Vitest.expect(text).toContain("Phase 'C' is not the active phase");
      Vitest.expect(text).not.toContain('(it is locked)');

      const active = yield* runExecute(work, { name: 'ship-login', phase: 'B' });
      Vitest.expect(active.phase).toBe('B');
      Vitest.expect(active.budget).toBe(2);
      Vitest.expect(active.next).toContain('phase B');
      Vitest.expect(active.next).toContain('B001');
      Vitest.expect(active.next).not.toContain('A001');
      Vitest.expect(active.next).not.toContain('C001');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('names the resolved spec, not --dir, when the review store is unreadable', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);
      // A review store that is a regular file: every spec's series read fails.
      yield* work.fs.writeFileString(
        work.path.join(work.dir, '.agents', '@montflow', 'reviews'),
        'not a directory',
      );

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     store.error');
      // One canonical locator: the spec the failed read belongs to, never the
      // `--dir` base the command happened to be given.
      Vitest.expect(text).toContain('path     ship-login/review-series');
      Vitest.expect(text).toContain('field    review-series');
      Vitest.expect(text).not.toContain('path     specs/review-series');
      Vitest.expect(text).not.toContain(work.dir);
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a complete spec instead of rendering a session at budget 0', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', completeSpec('ship-login'));
      yield* preparePrompts(work);

      for (const options of [{}, { phase: 'A' }] as const) {
        const error = yield* runExecute(work, { name: 'ship-login', ...options }).pipe(Effect.flip);
        const text = diagnose(error);
        Vitest.expect(text).toContain('code     spec.no-active-phase');
        Vitest.expect(text).toContain('every phase is locked and complete');
        Vitest.expect(text).toContain('Nothing to dispatch');
        Vitest.expect(text).not.toContain('pass --phase');
        Vitest.expect(text).not.toContain('budget 0');
      }
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('floors a review-only phase budget at 1', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'hist', completeUnsizedPhase('hist'));
      yield* preparePrompts(work);

      const report = yield* runExecute(work, { name: 'hist' });
      Vitest.expect(report.budget).toBe(1);
      Vitest.expect(report.next).toContain('budget 1');
      Vitest.expect(report.next).toContain('A099');
      Vitest.expect(report.prompt.text).toContain('budget is 1');
      Vitest.expect(report.prompt.text).not.toContain('below 0');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a declared doctor-owned skill that is not installed', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);
      yield* work.fs.remove(work.path.join(work.dir, '.agents', 'skills', 'montflow-find-specs'), {
        recursive: true,
      });

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.skill-missing');
      Vitest.expect(text).toContain("Skill 'montflow-find-specs'");
      Vitest.expect(text).toContain('fix      Run mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('renders with an advisory when a declared non-doctor skill is missing', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);
      yield* work.fs.remove(
        work.path.join(work.dir, '.agents', 'skills', 'montflow-adversarial-review'),
        { recursive: true },
      );

      const report = yield* runExecute(work, { name: 'ship-login' });
      Vitest.expect(report.prompt.skills).toStrictEqual([
        'montflow-find-specs',
        'montflow-addressing-adversarial-review',
      ]);
      Vitest.expect(report.prompt.advisories.map((advisory) => advisory.field)).toStrictEqual([
        'montflow-adversarial-review',
      ]);
      Vitest.expect(report.prompt.text).toContain('code     ! prompt.skill-advisory');
      Vitest.expect(report.prompt.text).toContain("Skill 'montflow-adversarial-review'");
      Vitest.expect(report.prompt.text).toContain(
        'npx skills add montflow/montflow -s montflow-adversarial-review',
      );
      Vitest.expect(report.prompt.text).toContain('next     mf-specs execute --name <spec>');
      Vitest.expect(report.prompt.text).not.toContain('code     prompt.skill-missing');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a blocked declared skill and names the removal, not doctor', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);
      const target = work.path.join(work.dir, '.agents', 'skills', 'montflow-find-specs');
      const outside = work.path.join(work.dir, 'outside-skill');
      yield* work.fs.makeDirectory(outside, { recursive: true });
      yield* work.fs.writeFileString(work.path.join(outside, 'SKILL.md'), 'outside\n');
      yield* work.fs.remove(target, { recursive: true });
      yield* work.fs.symlink(outside, target);

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.skill-blocked');
      Vitest.expect(text).toContain("Skill 'montflow-find-specs'");
      Vitest.expect(text).toContain('fix      Remove the symlink');
      Vitest.expect(text).not.toContain('fix      Run mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a blocked prompt and names the move, not doctor', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);
      const target = work.path.join(
        work.dir,
        '.agents',
        '@montflow',
        'prompts',
        'spec-execute.json',
      );
      yield* work.fs.remove(target);
      yield* work.fs.makeDirectory(target);

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.blocked');
      Vitest.expect(text).toContain('fix      Move ');
      Vitest.expect(text).toContain('out of the way');
      Vitest.expect(text).not.toContain('fix      Run mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses an unknown phase with the known list', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);

      const error = yield* runExecute(work, { name: 'ship-login', phase: 'Z' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     spec.phase-not-found');
      Vitest.expect(text).toContain("Phase 'Z' not found");
      Vitest.expect(text).toContain('one of A');
      Vitest.expect(text).toContain('--phase A');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('defaults to guided and switches only interaction for autonomous', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);

      const guided = yield* runExecute(work, { name: 'ship-login' });
      Vitest.expect(guided.prompt.text).toContain('Guided run (the default)');
      Vitest.expect(guided.prompt.text).not.toContain('Ask only for');

      const autonomous = yield* runExecute(work, { name: 'ship-login', mode: 'autonomous' });
      Vitest.expect(autonomous.prompt.text).toContain('Ask only for');
      Vitest.expect(autonomous.prompt.text).toContain('MEMORY.md');
      Vitest.expect(autonomous.prompt.text).not.toContain('Guided run (the default)');
      for (const rule of ['Dispatch the ready set', 'depends-on', 'gates', 'review', 'lock']) {
        Vitest.expect(autonomous.prompt.text).toContain(rule);
      }
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('rejects an unknown mode before reading the spec tree', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      // A broken tree proves ordering: the flag error must win over the
      // missing MEMORY.md the tree check would report first.
      yield* seed(work, 'ship-login', [
        ['SPEC.md', specMarkdown({ name: 'ship-login' })],
        [
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', size: 'small' }),
        ],
      ]);

      const error = yield* runExecute(work, { name: 'ship-login', mode: 'autopilot' }).pipe(
        Effect.flip,
      );
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.mode');
      Vitest.expect(text).toContain('path     --mode');
      Vitest.expect(text).toContain('field    --mode');
      Vitest.expect(text).toContain('expected one of guided, autonomous');
      Vitest.expect(text).toContain('actual   autopilot');
      Vitest.expect(text).not.toContain('MEMORY.md');
      Vitest.expect(text).not.toContain('spec-execute.json');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('resolves an omitted name from the checked-out branch', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'other-spec', phaseA('other-spec', 'small'));
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* branch(work, 'feat/ship-login');
      yield* preparePrompts(work);

      const report = yield* runExecute(work);
      Vitest.expect(report.name).toBe('ship-login');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses an ambiguous branch and tells the agent to ask the user', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'spec-one', phaseA('spec-one', 'small'));
      yield* seed(work, 'spec-two', phaseA('spec-two', 'small'));
      yield* branch(work, 'feat/spec');
      yield* preparePrompts(work);

      const error = yield* runExecute(work).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     SPEC_AMBIGUOUS');
      Vitest.expect(text).toContain('candidates spec-one, spec-two');
      Vitest.expect(text).toContain('--name spec-one');
      Vitest.expect(text).toContain('--name spec-two');
      Vitest.expect(text).toContain('next     ask the user');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('lets an explicit name win over an ambiguous branch', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'spec-one', phaseA('spec-one', 'small'));
      yield* seed(work, 'spec-two', phaseA('spec-two', 'small'));
      yield* branch(work, 'feat/spec');
      yield* preparePrompts(work);

      // Prove the fixture really is ambiguous, so the explicit call below is
      // the only reason it resolves.
      const ambiguous = yield* runExecute(work).pipe(Effect.flip);
      Vitest.expect(diagnose(ambiguous)).toContain('code     SPEC_AMBIGUOUS');

      const report = yield* runExecute(work, { name: 'spec-one' });
      Vitest.expect(report.name).toBe('spec-one');
      Vitest.expect(report.prompt.text).toContain('spec-one');
      Vitest.expect(report.prompt.text).not.toContain('spec-two');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses an unknown spec before rendering', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* preparePrompts(work);

      const error = yield* runExecute(work, { name: 'nope' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     spec.not-found');
      Vitest.expect(text).toContain("Spec 'nope' not found");
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses an invalid spec tree before rendering', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', [
        ['SPEC.md', specMarkdown({ name: 'ship-login' })],
        [
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login', size: 'small' }),
        ],
      ]);
      yield* preparePrompts(work);

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('A001-implement-login/MEMORY.md');
      Vitest.expect(text).toContain('Required file is missing');
    }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect(
    'renders without any model or session port, so the binary never dispatches',
    () =>
      // The effect's requirements are exactly the stores and platform services;
      // a ModelPort or SessionDispatchPort would make this provider fail to
      // compile. Rendering returns text, never a session id or a reply.
      Effect.gen(function* () {
        const work = yield* prepare;
        yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
        yield* preparePrompts(work);

        const authored = yield* runAuthor(work, { request: 'Ship login' });
        Vitest.expect(authored.text).toContain('Ship login');

        const executed = yield* runExecute(work, { name: 'ship-login' });
        Vitest.expect(executed.prompt.text).toContain('spec execution orchestrator');
        Vitest.expect(executed.prompt.text).not.toContain('Completed session');
      }).pipe(Effect.provide(StoreLive)),
  );

  Vitest.it.effect('refuses a missing prompt after the spec resolves', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));

      const error = yield* runExecute(work, { name: 'ship-login' }).pipe(Effect.flip);
      const text = diagnose(error);
      Vitest.expect(text).toContain('code     prompt.missing');
      Vitest.expect(text).toContain('fix      Run mf-specs doctor');
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('Cli fresh doctor-only workspace', () => {
  Vitest.it.effect('renders author, execute, and sizing with the packaged skills only', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      // The only install step: no foreign skill is copied into this workspace.
      yield* runDoctor(work.dir);

      const authored = yield* runAuthor(work, { request: 'Ship login' });
      Vitest.expect(authored.skills).toStrictEqual(['montflow-create-specs']);
      Vitest.expect(authored.advisories).toStrictEqual([]);

      const executed = yield* runExecute(work, { name: 'ship-login' });
      Vitest.expect(executed.prompt.skills).toStrictEqual(['montflow-find-specs']);
      Vitest.expect(executed.prompt.advisories.map((advisory) => advisory.field)).toStrictEqual([
        'montflow-adversarial-review',
        'montflow-addressing-adversarial-review',
      ]);
      Vitest.expect(executed.prompt.text).toContain('code     ! prompt.skill-advisory');
      Vitest.expect(executed.prompt.text).toContain('next     mf-specs execute --name <spec>');

      const sized = yield* runSizing(work, { scope: 'repo' });
      Vitest.expect(sized.prompt.skills).toStrictEqual([
        'montflow-find-specs',
        'montflow-create-specs',
      ]);
      Vitest.expect(sized.prompt.advisories.map((advisory) => advisory.field)).toStrictEqual([
        'executing-skills',
        'grilling',
        'i-have-adhd',
      ]);
      for (const skill of ['executing-skills', 'grilling', 'i-have-adhd']) {
        Vitest.expect(sized.prompt.text).toContain(skill);
      }
    }).pipe(Effect.provide(StoreLive)),
  );
});

Vitest.describe('Cli.execute store reads', () => {
  Vitest.it.effect('reads the snapshot, repo config, and review series exactly once', () => {
    const counters = { snapshot: 0, readRootFile: 0, reviewSeries: 0 };
    const countingStore = makeCountingLayer(counters);
    const storeLive = Layer.mergeAll(
      countingStore,
      Layer.provide(PromptStore.Default, Platform),
      Platform,
    );
    return Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login', 'small'));
      yield* preparePrompts(work);

      const report = yield* execute(storeDirOf(work.dir), {
        workspace: work.dir,
        name: 'ship-login',
      });
      Vitest.expect(report.name).toBe('ship-login');
      Vitest.expect(counters.snapshot).toBe(1);
      Vitest.expect(counters.readRootFile).toBe(1);
      Vitest.expect(counters.reviewSeries).toBe(1);
    }).pipe(Effect.provide(storeLive));
  });
});
