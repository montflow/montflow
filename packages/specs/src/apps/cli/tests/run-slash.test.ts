import * as Vitest from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';
import { runDoctor } from '../../../apps/doctor/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import * as Catalogue from '../../../modules/catalogue/index.js';
import { DEFAULT_ROOT, SurfaceError, runSlash, sizingConfig } from '../index.js';
import { REPO_SIZING, SPEC_SIZING, entry, memory, stubLayer } from './helpers.js';

const specs = new Map([
  [
    'ok',
    [
      entry('SPEC.md', specMarkdown({ name: 'ok' })),
      entry('sizing.json', SPEC_SIZING),
      entry(
        'A001-implement-login/TASK.md',
        taskMarkdown({ id: 'A001', name: 'implement-login', size: 'tiny' }),
      ),
      entry('A001-implement-login/MEMORY.md', memory),
      entry(
        'A099-review-phase/TASK.md',
        taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
      ),
      entry('A099-review-phase/MEMORY.md', memory),
    ],
  ],
  ['bad', [entry('SPEC.md', specMarkdown({ name: 'bad' }))]],
]);

const root = '.agents/@montflow/specs';

/** Read a slash failure's problem whether it is a surface or store error. */
const slashProblem = (error: {
  readonly reason?: string;
  readonly diagnostics?: ReadonlyArray<{ readonly problem: string }>;
}): string => error.diagnostics?.[0]?.problem ?? error.reason ?? '';

Vitest.describe('Cli.runSlash runtime', () => {
  Vitest.it.effect('runs check for one spec', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('1 spec');
    }),
  );

  Vitest.it.effect('lists passing specs with --verbose', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --verbose', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2713 ok');
    }),
  );

  Vitest.it.effect('runs status --name', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('status --name ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('Phase A');
    }),
  );

  Vitest.it.effect('reports a failing status as not ok', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('status --name bad', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2717');
    }),
  );

  Vitest.it.effect('rejects status without --name', () =>
    Effect.gen(function* () {
      const error = yield* runSlash('status', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(slashProblem(error)).toContain('status requires --name');
    }),
  );

  Vitest.it.effect('runs list --pending', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('list --pending', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('2 specs');
    }),
  );

  Vitest.it.effect('accepts --strict for a clean spec', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name ok --strict', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
    }),
  );

  Vitest.it.effect('fails a broken spec under --strict', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name bad --strict', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
    }),
  );

  Vitest.it.effect('reports an unknown list status as an error', () =>
    Effect.gen(function* () {
      const error = yield* runSlash('list --status=bogus', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(slashProblem(error)).toContain("Unknown status 'bogus'");
    }),
  );
});

Vitest.describe('Cli.runSlash sizing verbs runtime', () => {
  Vitest.it.effect('resolves the dispatch target and prints nothing else', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('resolve --name ok --task A001', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.output).toBe('fixture/phase-model#high');
      Vitest.expect(report.ok).toBe(true);
    }),
  );

  Vitest.it.effect('prints the compact sizing line', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('sizing --name ok --task A001', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.output).toBe('A001  tiny  fixture/phase-model#high  phase');
      Vitest.expect(report.ok).toBe(true);
    }),
  );

  Vitest.it.effect('prints the provenance matrix for --verbose and --human alike', () =>
    Effect.gen(function* () {
      for (const flag of ['--verbose', '--human']) {
        const report = yield* runSlash(`sizing --name ok --task A001 ${flag}`, root).pipe(
          Effect.provide(stubLayer(specs)),
        );
        Vitest.expect(report.output).toContain('A001 · declared tiny');
        Vitest.expect(report.output).toContain('winner');
        Vitest.expect(report.output).toContain('fixture/phase-model#high');
        Vitest.expect(report.output).toContain('inherit');
      }
    }),
  );

  Vitest.it.effect('reports an unknown task as a diagnostic without throwing', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('resolve --name ok --task Z999', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     task.not-found');
      Vitest.expect(report.output).toContain('next     mf-specs status --name ok');
    }),
  );

  Vitest.it.effect('reports every repo-config finding through the diagnostic shape', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name ok', root).pipe(
        Effect.provide(
          stubLayer(
            specs,
            new Map([['sizing.json', '{ "sizes": { "tiny": { "effort": "low" } } }']]),
          ),
        ),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('\u2717 sizing.json (2)');
      Vitest.expect(report.output).toContain('code     sizing.missing-model');
      Vitest.expect(report.output).toContain(
        'fix      Add "model": "provider/model" to sizes.tiny.',
      );
    }),
  );

  Vitest.it.effect('accepts a valid repo-only config when the spec is named', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --name ok', root).pipe(
        Effect.provide(stubLayer(specs, new Map([['sizing.json', REPO_SIZING]]))),
      );
      Vitest.expect(report.ok).toBe(true);
    }),
  );

  Vitest.it.effect('requires --task for the machine verbs', () =>
    Effect.gen(function* () {
      const error = yield* runSlash('sizing --name ok', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(slashProblem(error)).toContain('sizing requires --name <spec> and --task <id>');
    }),
  );
});

Vitest.describe('Cli.runSlash which runtime', () => {
  Vitest.it.effect('resolves an explicit branch and prints only the name', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('which --branch feat/ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.output).toBe('ok');
      Vitest.expect(report.ok).toBe(true);
    }),
  );

  Vitest.it.effect('renders a miss as one agent-first diagnostic', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('which --branch wip/ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     SPEC_NO_MATCH');
      Vitest.expect(report.output).toContain('--name ok');
      Vitest.expect(report.output).toContain('next     ask the user');
    }),
  );
});

Vitest.describe('Cli.runSlash sizing-config runtime', () => {
  /**
   * The sizing wizard declares three skills doctor does not ship, so the
   * throwaway workspace installs stubs for them alongside the doctor payload.
   */
  const workspace = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-slash-sizing-' });
    yield* runDoctor(dir);
    for (const name of ['executing-skills', 'grilling', 'i-have-adhd']) {
      const skillDir = path.join(dir, '.agents', 'skills', name);
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
    return { dir, root: path.join(dir, DEFAULT_ROOT) };
  });

  Vitest.it.effect('renders the open scope and every fixed scope', () =>
    Effect.gen(function* () {
      const work = yield* workspace;

      const open = yield* runSlash('sizing-config', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(open.ok).toBe(true);
      Vitest.expect(open.output).toContain('Scope is open: no layer is selected.');

      const repo = yield* runSlash('sizing-config --scope repo', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(repo.ok).toBe(true);
      Vitest.expect(repo.output).toContain('Scope: repo (fixed for this run');

      const spec = yield* runSlash('sizing-config --name ok', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(spec.ok).toBe(true);
      Vitest.expect(spec.output).toContain('Spec: ok. Its config is `ok/sizing.json`.');

      const phase = yield* runSlash('sizing-config --name ok --phase A', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(phase.ok).toBe(true);
      Vitest.expect(phase.output).toContain('`phases.A.sizes` inside `ok/sizing.json`');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('dispatches the same rendered prompt as the shared engine', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const engine = yield* sizingConfig(work.dir, { name: 'ok', mode: 'autonomous' }).pipe(
        Effect.provide(stubLayer(specs)),
      );
      const slash = yield* runSlash('sizing-config --name ok --mode autonomous', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(slash.ok).toBe(true);
      Vitest.expect(slash.output).toBe(engine.prompt.text);
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('renders a conflicting scope as a coded diagnostic, not a throw', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash('sizing-config --phase A', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     cli.invalid-argument');
      Vitest.expect(report.output).toContain('field    --phase');
      Vitest.expect(report.output).toContain('--phase requires --name');
      Vitest.expect(report.output).toContain('mf-specs sizing-config --name <spec> --phase A');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('refuses a supplied but blank --name', () =>
    Effect.gen(function* () {
      const work = yield* workspace;

      // `--name=` is supplied and blank: a usage error, not the open scope.
      const open = yield* runSlash('sizing-config --name=', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(open.ok).toBe(false);
      Vitest.expect(open.output).toContain('code     cli.invalid-argument');
      Vitest.expect(open.output).toContain('field    --name');
      Vitest.expect(open.output).toContain('--name requires a spec name');

      const missing = yield* runSlash('sizing-config --scope spec --name=', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(missing.ok).toBe(false);
      Vitest.expect(missing.output).toContain('field    --name');
      Vitest.expect(missing.output).toContain('mf-specs sizing-config --scope spec --name <spec>');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('rejects an invalid mode with the shared mode diagnostic', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash('sizing-config --mode autopilot', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     prompt.mode');
      Vitest.expect(report.output).toContain('expected one of guided, autonomous');
    }).pipe(Effect.provide(stubLayer(specs))),
  );
});

Vitest.describe('Cli.runSlash author/execute runtime', () => {
  /**
   * The slash form resolves prompts from the workspace root. A throwaway
   * workspace with doctor-installed prompts keeps the test off the developer's
   * checkout while the in-memory store still supplies the spec state.
   */
  const workspace = Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-slash-' });
    yield* runDoctor(dir);
    // The execution prompt declares two review skills from another package;
    // install stubs so rendering reaches the prompt instead of the skill gate.
    for (const name of ['montflow-adversarial-review', 'montflow-addressing-adversarial-review']) {
      const skillDir = path.join(dir, '.agents', 'skills', name);
      yield* fs.makeDirectory(skillDir, { recursive: true });
      yield* fs.writeFileString(
        path.join(skillDir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
    return { dir, root: path.join(dir, DEFAULT_ROOT) };
  });

  Vitest.it.effect('renders the authoring prompt and keeps prose flag values together', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash(
        'author --request Ship login --notes Do not touch packages/core.',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('Ship login');
      Vitest.expect(report.output).toContain('Extra constraints');
      Vitest.expect(report.output).toContain('Do not touch packages/core.');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('requires --request for author', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const error = yield* runSlash('author', work.root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(SurfaceError);
      if (!(error instanceof SurfaceError)) return;
      const found = error.diagnostics[0];
      Vitest.expect(found?.code).toBe('cli.invalid-argument');
      Vitest.expect(found?.field).toBe('--request');
      Vitest.expect(found?.problem).toContain('author requires --request');
      Vitest.expect(found?.fix).toContain('--request');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('renders execute for an explicit name with the derived budget', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash('execute --name ok', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('ok');
      Vitest.expect(report.output).toContain('budget is 1');
      Vitest.expect(report.output).toContain('A001');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('accepts the autonomous mode and rejects an invented one', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const autonomous = yield* runSlash('execute --name ok --mode autonomous', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(autonomous.ok).toBe(true);
      Vitest.expect(autonomous.output).toContain('Ask only for');

      const rejected = yield* runSlash('execute --name ok --mode autopilot', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(rejected.ok).toBe(false);
      Vitest.expect(rejected.output).toContain('code     prompt.mode');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('renders an unknown spec as a diagnostic, not a throw', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash('execute --name nope', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     spec.not-found');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('models --json reads the host model source', () =>
    Effect.gen(function* () {
      const hostModels: Catalogue.ModelSource = {
        list: () =>
          Effect.succeed([
            { providerID: 'fixture', modelID: 'spec-model', variants: ['low', 'medium'] },
            { providerID: 'fixture', modelID: 'repo-model', variants: [] },
          ]),
        default: () => Effect.succeed({ providerID: 'fixture', modelID: 'spec-model' }),
      };
      const report = yield* runSlash('models --json', root, (dir) => dir, hostModels).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('"default": "fixture/spec-model"');
      Vitest.expect(report.output).toContain('"variants": []');
    }),
  );

  Vitest.it.effect('models --verify reports catalogue warnings, not a failed slash run', () =>
    Effect.gen(function* () {
      const hostModels: Catalogue.ModelSource = {
        list: () =>
          Effect.succeed([{ providerID: 'fixture', modelID: 'spec-model', variants: [] }]),
        default: () => Effect.succeed(undefined),
      };
      const report = yield* runSlash(
        'models --verify --name ok',
        root,
        (dir) => dir,
        hostModels,
      ).pipe(Effect.provide(stubLayer(specs, new Map([['sizing.json', REPO_SIZING]]))));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('code     ! models.unknown-model');
      Vitest.expect(report.output).toContain('code     ! models.unknown-effort');
    }),
  );

  Vitest.it.effect('models without a host source or --catalog is models.unavailable', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('models', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     models.unavailable');
      Vitest.expect(report.output).toContain('--catalog');
    }),
  );
});
