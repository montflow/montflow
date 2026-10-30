import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '@montflow/prompts';
import { Cause, Effect, Layer } from 'effect';
import * as Catalogue from '../../../modules/catalogue/index.js';
import { PromptError } from '../../../modules/prompt/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import type { SpecFileEntry } from '../../../modules/structure/index.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  SurfaceError,
  VALIDATION_EXIT_CODE,
  check,
  diagnoseCause,
  execute,
  guardPhase,
  guardSpecName,
  next,
  resolveSizingScope,
  runSlash,
  scaffold,
  sizingConfig,
  sizingOf,
  state,
  status,
  verifyModels,
} from '../index.js';
import { entry, memory, stubLayer } from './helpers.js';

/**
 * Every spec-name and phase surface refuses a malformed identifier before any
 * store read or prompt render. The tables below pin the one guard each flag
 * uses, the diagnostic shape (`cli.invalid-argument`, `--name` / `--phase`, a
 * slug or phase fix), the non-zero exit, and that a refused run never reaches
 * the store or names an out-of-root write target.
 */

const root = '.agents/@montflow/specs';
const workspace = '.';

/** Values outside the slug grammar, including padded and traversal attempts. */
const MALFORMED_NAMES = [
  '..',
  '../../etc',
  '.',
  '/etc/passwd',
  'a/b',
  'a\\b',
  'Spec',
  'ship spec',
  'A',
  ' ship-login ',
  '\tship-login',
  '',
  '   ',
] as const;

/**
 * Values outside the phase grammar. `A` is valid and blank means "absent"; a
 * padded id is malformed everywhere and must never be trimmed into `A`.
 */
const MALFORMED_PHASES = [
  '..',
  '../../etc',
  '.',
  '/etc/passwd',
  'a/b',
  'a\\b',
  'Spec',
  'a',
  'A1',
  'AA B',
  ' A ',
  '\tA',
  'AB ',
] as const;

/** A store whose every method is a defect: a guarded surface never calls one. */
const sealedStore = Layer.succeed(
  SpecStore.SpecStore,
  SpecStore.SpecStore.of({
    names: () => Effect.die('store.names was read'),
    hasRoot: () => Effect.die('store.hasRoot was read'),
    exists: (_root, name) => Effect.die(`store.exists was read for '${name}'`),
    hasFile: (_root, name) => Effect.die(`store.hasFile was read for '${name}'`),
    snapshot: (_root, name) => Effect.die(`store.snapshot was read for '${name}'`),
    reviewSeries: (_root, name) => Effect.die(`store.reviewSeries was read for '${name}'`),
    readRootFile: () => Effect.die('store.readRootFile was read'),
    write: () => Effect.die('store.write was read'),
  }),
);

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** The sealed store plus the services the prompt verbs would need on success. */
const SealedLive = Layer.mergeAll(
  sealedStore,
  Layer.provide(PromptStore.Default, Platform),
  Platform,
);

/** A host source that reports no models; the guard must run before this too. */
const source: Catalogue.ModelSource = {
  list: () => Effect.succeed([]),
  default: () => Effect.succeed(undefined),
};

/** Every expected failure a guarded surface can raise. */
type Refusal = SurfaceError | SpecStore.StoreError | PromptError;

/** One surface under test: run it with a malformed value. */
interface Surface {
  readonly label: string;
  readonly run: (value: string) => Effect.Effect<unknown, Refusal, never>;
  /** The command the refusal names as the one to re-run after the repair. */
  readonly rerun: string;
}

const NAME_SURFACES: ReadonlyArray<Surface> = [
  {
    label: 'status',
    run: (name) => status(root, name).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs status --name <spec>',
  },
  {
    label: 'next',
    run: (name) => next(root, name).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs next --name <spec>',
  },
  {
    label: 'state',
    run: (name) => state(root, name).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs state --name <spec>',
  },
  {
    label: 'check',
    run: (name) => check(root, { name }).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs check --name <spec>',
  },
  {
    label: 'sizing',
    run: (name) => sizingOf(root, name, 'A001').pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs sizing --name <spec> --task <id>',
  },
  {
    label: 'resolve',
    run: (name) =>
      sizingOf(root, name, 'A001', 'mf-specs resolve --name <spec> --task <id>').pipe(
        Effect.provide(SealedLive),
      ),
    rerun: 'mf-specs resolve --name <spec> --task <id>',
  },
  {
    label: 'models --verify',
    run: (name) => verifyModels(root, { name }, source).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs models --verify --name <spec>',
  },
  {
    label: 'create',
    run: (name) => scaffold(root, { name }).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs create --name <slug>',
  },
  {
    label: 'execute --name',
    run: (name) => execute(root, { name, workspace }).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs execute --name <spec>',
  },
  {
    label: 'sizing-config --name',
    run: (name) => sizingConfig(workspace, { name }).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs sizing-config --name <spec>',
  },
];

const PHASE_SURFACES: ReadonlyArray<Surface> = [
  {
    label: 'execute --phase',
    run: (phase) =>
      execute(root, { name: 'ship-spec', phase, workspace }).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs execute --name <spec> --phase <id>',
  },
  {
    label: 'sizing-config --phase',
    run: (phase) =>
      sizingConfig(workspace, { name: 'ship-spec', phase }).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs sizing-config --name <spec> --phase <id>',
  },
];

/** One slash surface under test. Slash arms render failures as `ok: false`. */
interface SlashSurface {
  readonly label: string;
  readonly run: (value: string) => Effect.Effect<{ output: string; ok: boolean }, Refusal, never>;
  /** The command the refusal names as the one to re-run after the repair. */
  readonly rerun: string;
}

/** The slash form of a `--name` value, using `--name=` for the blank case. */
const slashName = (name: string): string => (name === '' ? '--name=' : `--name ${name}`);

/** Slash forms inherit the same guards. Spaces cannot survive the slash parser. */
const SLASH_NAME_SURFACES: ReadonlyArray<SlashSurface> = [
  {
    label: '/specs status',
    run: (name) => runSlash(`status ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs status --name <spec>',
  },
  {
    label: '/specs state',
    run: (name) => runSlash(`state ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs state --name <spec>',
  },
  {
    label: '/specs next',
    run: (name) => runSlash(`next ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs next --name <spec>',
  },
  {
    label: '/specs check',
    run: (name) => runSlash(`check ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs check --name <spec>',
  },
  {
    label: '/specs resolve',
    run: (name) =>
      runSlash(`resolve ${slashName(name)} --task A001`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs resolve --name <spec> --task <id>',
  },
  {
    label: '/specs sizing',
    run: (name) =>
      runSlash(`sizing ${slashName(name)} --task A001`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs sizing --name <spec> --task <id>',
  },
  {
    label: '/specs models --verify',
    run: (name) =>
      runSlash(`models --verify ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs models --verify --name <spec>',
  },
  {
    label: '/specs create',
    run: (name) => runSlash(`create ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs create --name <slug>',
  },
  {
    label: '/specs execute',
    run: (name) => runSlash(`execute ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs execute --name <spec>',
  },
  {
    label: '/specs sizing-config',
    run: (name) =>
      runSlash(`sizing-config ${slashName(name)}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs sizing-config --name <spec>',
  },
];

/** Slash names the parser can carry as one token: no blank, no whitespace. */
const SLASH_NAMES = MALFORMED_NAMES.filter((name) => name !== '' && !/\s/.test(name));

/** Slash phases the parser can carry: a token with no whitespace. */
const SLASH_PHASES = MALFORMED_PHASES.filter((phase) => !/\s/.test(phase));

const SLASH_PHASE_SURFACES: ReadonlyArray<SlashSurface> = [
  {
    label: '/specs execute --phase',
    run: (phase) =>
      runSlash(`execute --name ship-spec --phase ${phase}`, root).pipe(Effect.provide(SealedLive)),
    rerun: 'mf-specs execute --name <spec> --phase <id>',
  },
  {
    label: '/specs sizing-config --phase',
    run: (phase) =>
      runSlash(`sizing-config --name ship-spec --phase ${phase}`, root).pipe(
        Effect.provide(SealedLive),
      ),
    rerun: 'mf-specs sizing-config --name <spec> --phase <id>',
  },
];

/** Narrow a flipped effect error to the surface the CLI renders. */
const surfaceOf = (error: Refusal): SurfaceError => {
  if (!(error instanceof SurfaceError)) {
    throw new Error(`expected a SurfaceError, got: ${String(error)}`);
  }
  return error;
};

/** Assert one refusal: code, field, fix, next, exit code, and no out-of-root output. */
const expectRefusal = (
  error: Refusal,
  field: '--name' | '--phase',
  value: string,
  rerun: string,
): void => {
  const surface = surfaceOf(error);
  const found = surface.diagnostics[0];
  Vitest.expect(found?.code, `${field} ${value}: code`).toBe('cli.invalid-argument');
  Vitest.expect(found?.field, `${field} ${value}: field`).toBe(field);
  Vitest.expect(found?.fix ?? '', `${field} ${value}: fix`).toContain(
    field === '--name' ? 'slug' : 'phase id',
  );
  Vitest.expect(found?.actual, `${field} ${value}: actual`).toBe(
    value === '' ? 'empty string' : `'${value}'`,
  );
  Vitest.expect(found?.next, `${field} ${value}: next`).toBe(rerun);
  const diagnosed = diagnoseCause(Cause.fail(surface), {
    path: root,
    rerun: 'mf-specs list',
    verbose: false,
  });
  Vitest.expect(diagnosed.exitCode, `${field} ${value}: exit`).toBe(VALIDATION_EXIT_CODE);
  // Nothing from outside the specs root may leak into the report.
  Vitest.expect(diagnosed.output, `${field} ${value}: tasks`).not.toContain('A001');
  Vitest.expect(diagnosed.output, `${field} ${value}: write target`).not.toContain('sizing.json');
  Vitest.expect(diagnosed.output, `${field} ${value}: write target`).not.toContain('write target');
};

/** Assert one slash refusal: rendered code, field, fix, next, and no out-of-root output. */
const expectSlashRefusal = (
  report: { readonly output: string; readonly ok: boolean },
  field: '--name' | '--phase',
  value: string,
  rerun: string,
): void => {
  Vitest.expect(report.ok, `${field} ${value}: ok`).toBe(false);
  Vitest.expect(report.output, `${field} ${value}: code`).toContain(
    'code     cli.invalid-argument',
  );
  Vitest.expect(report.output, `${field} ${value}: field`).toContain(`field    ${field}`);
  Vitest.expect(report.output, `${field} ${value}: fix`).toContain(
    field === '--name' ? 'slug' : 'phase id',
  );
  Vitest.expect(report.output, `${field} ${value}: next`).toContain(`next     ${rerun}`);
  Vitest.expect(report.output, `${field} ${value}: tasks`).not.toContain('A001');
  Vitest.expect(report.output, `${field} ${value}: write target`).not.toContain('sizing.json');
  Vitest.expect(report.output, `${field} ${value}: write target`).not.toContain('write target');
};

Vitest.describe('Cli guardSpecName', () => {
  Vitest.it.effect('accepts the slug grammar and refuses every other value', () =>
    Effect.sync(() => {
      for (const name of ['ship-login', 'spec2', 'a']) {
        Vitest.expect(guardSpecName(name, 'mf-specs status --name <spec>'), name).toBeUndefined();
      }
      for (const name of MALFORMED_NAMES) {
        const found = guardSpecName(name, 'mf-specs status --name <spec>');
        Vitest.expect(found?.code, name).toBe('cli.invalid-argument');
        Vitest.expect(found?.field, name).toBe('--name');
        Vitest.expect(found?.expected ?? '', name).toContain('[a-z0-9]+');
        Vitest.expect(found?.fix ?? '', name).toContain('ship-login');
        Vitest.expect(found?.next, name).toBe('mf-specs status --name <spec>');
      }
    }),
  );
});

Vitest.describe('Cli guardPhase', () => {
  Vitest.it.effect('accepts one or two uppercase letters and refuses the rest', () =>
    Effect.sync(() => {
      for (const phase of ['A', 'Z', 'AA', 'AB']) {
        Vitest.expect(
          guardPhase(phase, 'mf-specs execute --name <spec> --phase <id>'),
          phase,
        ).toBeUndefined();
      }
      for (const phase of MALFORMED_PHASES) {
        const found = guardPhase(phase, 'mf-specs execute --name <spec> --phase <id>');
        Vitest.expect(found?.code, phase).toBe('cli.invalid-argument');
        Vitest.expect(found?.field, phase).toBe('--phase');
        Vitest.expect(found?.expected ?? '', phase).toContain('[A-Z]');
        Vitest.expect(found?.fix ?? '', phase).toContain('phase id');
        Vitest.expect(found?.next, phase).toBe('mf-specs execute --name <spec> --phase <id>');
      }
    }),
  );
});

/**
 * The one phase rule, table-driven over blank, padded, malformed, and valid
 * values. `sizing-config` derives its scope through this pure function, so the
 * table states what every verb must do with the same value: blank means
 * absent, a valid id is used as supplied, and padding is refused, never
 * trimmed.
 */
Vitest.describe('Cli phase rule', () => {
  const CASES = [
    { value: 'A', outcome: 'accepted' },
    { value: 'AB', outcome: 'accepted' },
    { value: '', outcome: 'absent' },
    { value: '   ', outcome: 'absent' },
    { value: '\t', outcome: 'absent' },
    { value: ' A ', outcome: 'refused' },
    { value: '\tA', outcome: 'refused' },
    { value: 'A ', outcome: 'refused' },
    { value: 'a', outcome: 'refused' },
    { value: '..', outcome: 'refused' },
    { value: '../../etc', outcome: 'refused' },
  ] as const;

  for (const item of CASES) {
    Vitest.it.effect(`${JSON.stringify(item.value)} is ${item.outcome} for sizing-config`, () =>
      Effect.sync(() => {
        const resolved = resolveSizingScope({ name: 'ship-spec', phase: item.value });
        if (item.outcome === 'refused') {
          Vitest.expect(resolved.ok).toBe(false);
          if (resolved.ok) return;
          Vitest.expect(resolved.diagnostic.code).toBe('cli.invalid-argument');
          Vitest.expect(resolved.diagnostic.field).toBe('--phase');
          Vitest.expect(resolved.diagnostic.actual).toBe(`'${item.value}'`);
          Vitest.expect(resolved.diagnostic.next).toBe(
            'mf-specs sizing-config --name <spec> --phase <id>',
          );
          return;
        }
        Vitest.expect(resolved.ok).toBe(true);
        if (!resolved.ok) return;
        Vitest.expect(resolved.request.phase).toBe(
          item.outcome === 'absent' ? undefined : item.value,
        );
      }),
    );
  }

  Vitest.it.effect('refuses a padded name instead of trimming it', () =>
    Effect.sync(() => {
      const resolved = resolveSizingScope({ name: '  ship-login  ' });
      Vitest.expect(resolved.ok).toBe(false);
      if (resolved.ok) return;
      Vitest.expect(resolved.diagnostic.field).toBe('--name');
      Vitest.expect(resolved.diagnostic.actual).toBe("'  ship-login  '");
    }),
  );
});

Vitest.describe('Cli name guards before the store', () => {
  for (const surface of NAME_SURFACES) {
    Vitest.it.effect(`${surface.label} refuses every malformed name`, () =>
      Effect.gen(function* () {
        for (const name of MALFORMED_NAMES) {
          const error = yield* surface.run(name).pipe(Effect.flip);
          expectRefusal(error, '--name', name, surface.rerun);
        }
      }),
    );
  }
});

Vitest.describe('Cli phase guards before the store', () => {
  for (const surface of PHASE_SURFACES) {
    Vitest.it.effect(`${surface.label} refuses every malformed phase`, () =>
      Effect.gen(function* () {
        for (const phase of MALFORMED_PHASES) {
          const error = yield* surface.run(phase).pipe(Effect.flip);
          expectRefusal(error, '--phase', phase, surface.rerun);
        }
      }),
    );
  }
});

Vitest.describe('Cli slash arms inherit the guards', () => {
  for (const surface of SLASH_NAME_SURFACES) {
    Vitest.it.effect(`${surface.label} refuses every malformed name`, () =>
      Effect.gen(function* () {
        for (const name of SLASH_NAMES) {
          const report = yield* surface.run(name);
          expectSlashRefusal(report, '--name', name, surface.rerun);
        }
        // `--name=` is the only way the parser can carry a blank value.
        const blank = yield* surface.run('');
        expectSlashRefusal(blank, '--name', '', surface.rerun);
      }),
    );
  }

  for (const surface of SLASH_PHASE_SURFACES) {
    Vitest.it.effect(`${surface.label} refuses every malformed phase`, () =>
      Effect.gen(function* () {
        for (const phase of SLASH_PHASES) {
          const report = yield* surface.run(phase);
          expectSlashRefusal(report, '--phase', phase, surface.rerun);
        }
      }),
    );
  }
});

Vitest.describe('Cli well-formed unknown identifiers keep D003 behavior', () => {
  const specs = new Map<string, ReadonlyArray<SpecFileEntry>>([
    [
      'ship-spec',
      [
        entry('SPEC.md', specMarkdown({ name: 'ship-spec' })),
        entry(
          'A001-implement-login/TASK.md',
          taskMarkdown({ id: 'A001', name: 'implement-login' }),
        ),
        entry('A001-implement-login/MEMORY.md', memory),
      ],
    ],
  ]);

  Vitest.it.effect('status reports spec.not-found, not a usage error', () =>
    Effect.gen(function* () {
      const error = yield* status(root, 'unknown-spec').pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      const found = surfaceOf(error).diagnostics[0];
      Vitest.expect(found?.code).toBe('spec.not-found');
      Vitest.expect(found?.code).not.toBe('cli.invalid-argument');
    }),
  );

  Vitest.it.effect('sizing still resolves a well-formed unknown task graph', () =>
    Effect.gen(function* () {
      const error = yield* sizingOf(root, 'unknown-spec', 'A001').pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      const found = surfaceOf(error).diagnostics[0];
      Vitest.expect(found?.code).toBe('spec.not-found');
    }),
  );

  Vitest.it.effect('a valid slug still reaches the store', () =>
    Effect.gen(function* () {
      const report = yield* status(root, 'ship-spec').pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.name).toBe('ship-spec');
      Vitest.expect(report.tasks.map((task) => task.id)).toStrictEqual(['A001']);
    }),
  );
});
