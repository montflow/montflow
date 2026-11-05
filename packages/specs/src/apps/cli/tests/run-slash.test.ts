import * as Vitest from '@effect/vitest';
import { Effect, FileSystem, Path } from 'effect';
import { runDoctor } from '../../../modules/doctor/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { taskMarkdown } from '../../../modules/task/tests/helpers.js';
import * as Catalogue from '../../../modules/catalogue/index.js';
import {
  author as authorEngine,
  DEFAULT_ROOT,
  SurfaceError,
  runSlash,
  sizingConfig,
} from '../index.js';
import { REPO_SIZING, SPEC_SIZING, entry, memory, stubLayer } from './helpers.js';

const specs = new Map([
  [
    'ok',
    [
      entry('SPEC.md', specMarkdown({ name: 'ok', version: '2' })),
      entry('A/PHASE.md', phaseMarkdown()),
      entry('A/MEMORY.md', memory),
      entry('sizing.json', SPEC_SIZING),
      entry(
        'A/A001-implement-login/TASK.md',
        taskMarkdown({ id: 'A001', name: 'implement-login', size: 'tiny' }),
      ),
      entry('A/A001-implement-login/MEMORY.md', memory),
      entry(
        'A/A099-review-phase/TASK.md',
        taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review' }),
      ),
      entry('A/A099-review-phase/MEMORY.md', memory),
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

  Vitest.it.effect('runs next for a valid spec and reports ok', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('next --name ok', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('state pending');
      Vitest.expect(report.output).toContain('A001');
    }),
  );

  Vitest.it.effect('reports next as not ok under the same rule as status', () =>
    Effect.gen(function* () {
      const layer = stubLayer(specs);
      const statusReport = yield* runSlash('status --name bad', root).pipe(Effect.provide(layer));
      const nextReport = yield* runSlash('next --name bad', root).pipe(Effect.provide(layer));
      Vitest.expect(statusReport.ok).toBe(false);
      Vitest.expect(nextReport.ok).toBe(statusReport.ok);
      Vitest.expect(nextReport.output).toContain('code     unspecified');
      Vitest.expect(nextReport.output).toContain('next     mf-specs check --name bad');
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

Vitest.describe('Cli.runSlash flag validation', () => {
  /** One refusal case: the args, the offending flag, and the corrected command. */
  interface Refusal {
    readonly args: string;
    readonly field: string;
    readonly next: string;
  }

  const refused: ReadonlyArray<Refusal> = [
    {
      args: 'execute --scope repo',
      field: '--scope',
      next: '/specs sizing-config --scope repo',
    },
    { args: 'check --json', field: '--json', next: '/specs models --json' },
    {
      args: 'status --task A001',
      field: '--task',
      next: '/specs resolve --name <spec> --task A001',
    },
    { args: 'sizing-config --strict', field: '--strict', next: '/specs check --strict' },
    { args: 'which --name ok', field: '--name', next: '/specs check --name ok' },
  ];

  Vitest.it.effect('refuses a misplaced flag and names the command that reads it', () =>
    Effect.gen(function* () {
      for (const { args, field, next } of refused) {
        const report = yield* runSlash(args, root).pipe(Effect.provide(stubLayer(specs)));
        Vitest.expect(report.ok, args).toBe(false);
        Vitest.expect(report.output, args).toContain('code     cli.invalid-argument');
        Vitest.expect(report.output, args).toContain(`field    ${field}`);
        Vitest.expect(report.output, args).toContain(`next     ${next}`);
        Vitest.expect(report.output, args).toContain(`fix      Run ${next}`);
      }
    }),
  );

  Vitest.it.effect('refuses a flag no slash command reads', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('check --bogus --name ok', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     cli.invalid-argument');
      Vitest.expect(report.output).toContain('field    --bogus');
      Vitest.expect(report.output).toContain('not a flag any /specs command implements');
      Vitest.expect(report.output).toContain('next     /specs check --name ok');
    }),
  );

  Vitest.it.effect('refuses a switch written with an inline value and names the bare form', () =>
    Effect.gen(function* () {
      const cases = [
        {
          args: 'check --name ok --strict=true',
          field: '--strict',
          next: '/specs check --name ok --strict',
        },
        {
          args: 'sizing --name ok --task A001 --human=1',
          field: '--human',
          next: '/specs sizing --name ok --task A001 --human',
        },
        { args: 'list --pending=yes', field: '--pending', next: '/specs list --pending' },
        {
          args: 'models --json=true --provider fixture --catalog fixtures/catalog.json',
          field: '--json',
          next: '/specs models --json --provider fixture --catalog fixtures/catalog.json',
        },
      ];
      for (const { args, field, next } of cases) {
        const report = yield* runSlash(args, root).pipe(Effect.provide(stubLayer(specs)));
        Vitest.expect(report.ok, args).toBe(false);
        Vitest.expect(report.output, args).toContain('code     cli.invalid-argument');
        Vitest.expect(report.output, args).toContain(`field    ${field}`);
        Vitest.expect(report.output, args).toContain('is a switch and takes no value');
        Vitest.expect(report.output, args).toContain(`next     ${next}`);
        Vitest.expect(report.output, args).toContain(`fix      Write ${field} alone: ${next}.`);
      }
    }),
  );

  Vitest.it.effect('does not set a switch written with an inline value', () =>
    Effect.gen(function* () {
      // A broken spec would fail `check --strict`; the refusal must arrive
      // before the run, so an ignored `--strict=true` can never look clean.
      const report = yield* runSlash('check --name bad --strict=true', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).not.toContain('\u2717 bad');
    }),
  );

  Vitest.it.effect('refuses a flag a command does not implement before any store read', () =>
    Effect.gen(function* () {
      // The specs root does not exist: a usage error about the invocation is
      // reported as such instead of degrading into a store failure.
      const report = yield* runSlash('execute --scope repo', '.agents/@montflow/absent').pipe(
        Effect.provide(stubLayer(new Map())),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     cli.invalid-argument');
      Vitest.expect(report.output).not.toContain('store.error');
    }),
  );

  Vitest.it.effect('accepts every documented flag on every command', () =>
    Effect.gen(function* () {
      const documented = [
        'check --name ok --strict --verbose',
        'status --name ok --verbose',
        'state --name ok --verbose',
        'next --name ok --verbose',
        'resolve --name ok --task A001 --verbose',
        'sizing --name ok --task A001 --human --verbose',
        'models --json --provider fixture',
        'models --verify --name ok --provider fixture --catalog fixtures/catalog.json',
        'which --branch feat/ok --verbose',
        'list --pending --verbose',
        'list --status=complete',
        'create --name ship-login --description Ship --author Tester --workspace-type in-place --tasks build:execution:gates --reviewer-profiles reviewer',
        'author --request Ship login --notes Note --rigor standard --isolated no',
        'author --request Ship login --rigor standard --isolated yes --origin other --origin-branch release/2 --worktree-name ship-login',
        'execute --name ok --phase A --focus Steer --mode guided',
        'sizing-config --scope repo',
        'sizing-config --scope spec --name ok',
        'sizing-config --scope phase --name ok --phase A --focus Steer --mode autonomous',
        'sizing-config --name ok --phase A',
      ];
      // A throwaway copy of the store: `create` writes, and the shared fixture
      // map must not grow a spec the earlier suites counted.
      const local = new Map(specs);
      for (const args of documented) {
        const report = yield* runSlash(args, root).pipe(Effect.provide(stubLayer(local)));
        Vitest.expect(report.output, args).not.toContain('cli.invalid-argument');
      }
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
        'author --request Ship login --notes Do not touch packages/core. --rigor standard --isolated no',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('Ship login');
      Vitest.expect(report.output).toContain('Extra constraints');
      Vitest.expect(report.output).toContain('Do not touch packages/core.');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('joins the prose after an inline value instead of truncating it', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const spaced = yield* runSlash(
        'author --request Ship login --notes Do not touch packages/core. --rigor standard --isolated no',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      const inline = yield* runSlash(
        'author --request=Ship login --notes=Do not touch packages/core. --rigor=standard --isolated=no',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(inline.ok).toBe(true);
      // The `=` form is the same request, never `Ship` plus a dropped `login`.
      Vitest.expect(inline.output).toBe(spaced.output);
      Vitest.expect(inline.output).toContain('Ship login');
      Vitest.expect(inline.output).toContain('Do not touch packages/core.');
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('carries every authoring flag and renders the binary text', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash(
        'author --request Ship login --notes Do not touch packages/core. --rigor deep --isolated yes --origin other --origin-branch release/2 --worktree-name ship-login',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('Chosen rigor: `deep`');
      Vitest.expect(report.output).toContain('from origin `other`');
      Vitest.expect(report.output).toContain('at branch `release/2`');
      Vitest.expect(report.output).toContain('worktree named `ship-login`');
      Vitest.expect(report.output).toContain('Do not touch packages/core.');

      const engine = yield* authorEngine(work.dir, {
        request: 'Ship login',
        notes: 'Do not touch packages/core.',
        rigor: 'deep',
        isolated: 'yes',
        origin: 'other',
        originBranch: 'release/2',
        worktreeName: 'ship-login',
      }).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.output).toBe(engine.text);
    }).pipe(Effect.provide(stubLayer(specs))),
  );

  Vitest.it.effect('drops hidden isolation flags and refuses a missing origin branch', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const inPlace = yield* runSlash(
        'author --request Ship login --rigor standard --isolated no --origin main --origin-branch release/2 --worktree-name ship-login',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(inPlace.ok).toBe(true);
      for (const hidden of ['release/2', 'ship-login', 'from origin', 'worktree named']) {
        Vitest.expect(inPlace.output).not.toContain(hidden);
      }

      const missing = yield* runSlash(
        'author --request Ship login --rigor standard --isolated yes --origin other --worktree-name ship-login',
        work.root,
      ).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(missing.ok).toBe(false);
      Vitest.expect(missing.output).toContain('code     cli.invalid-argument');
      Vitest.expect(missing.output).toContain('field    --origin-branch');
      Vitest.expect(missing.output).toContain('expected a non-empty branch name');
      Vitest.expect(missing.output).toContain('actual   missing');
      Vitest.expect(missing.output).toContain(
        'next     mf-specs author --request <text> --rigor standard --isolated yes --origin other --worktree-name ship-login --origin-branch <branch>',
      );
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

  Vitest.it.effect('refuses an absent rigor with the coded authoring diagnostic', () =>
    Effect.gen(function* () {
      const work = yield* workspace;
      const report = yield* runSlash('author --request Ship login --isolated no', work.root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('code     cli.invalid-argument');
      Vitest.expect(report.output).toContain('field    --rigor');
      Vitest.expect(report.output).toContain(
        'expected one of trivial, light, standard, deep, critical',
      );
      Vitest.expect(report.output).toContain('next     mf-specs author');
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
      Vitest.expect(report.output).toContain('is the budget of the phase this session starts on');
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

Vitest.describe('Cli.runSlash v2 surfaces', () => {
  Vitest.it.effect('status and state show the derived lock and PHASE.md review decision', () =>
    Effect.gen(function* () {
      const layer = stubLayer(specs);
      const statusReport = yield* runSlash('status --name ok', root).pipe(Effect.provide(layer));
      Vitest.expect(statusReport.ok).toBe(true);
      Vitest.expect(statusReport.output).toContain('Phase A');
      Vitest.expect(statusReport.output).toContain('review required');
      Vitest.expect(statusReport.output).toContain('gate none');
      Vitest.expect(statusReport.output).not.toContain('locked-phases');

      const stateReport = yield* runSlash('state --name ok', root).pipe(Effect.provide(layer));
      Vitest.expect(stateReport.ok).toBe(true);
      Vitest.expect(stateReport.output).toContain('locked none');
      Vitest.expect(stateReport.output).toContain('review A:required');
      Vitest.expect(stateReport.output).toContain('gate none');
      Vitest.expect(stateReport.output).not.toContain('locked-phases');
    }),
  );

  Vitest.it.effect('next shows the active phase review decision and gate state', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('next --name ok', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain('phase A');
      Vitest.expect(report.output).toContain('review A:required');
      Vitest.expect(report.output).toContain('gate none');
    }),
  );

  Vitest.it.effect('lock derives from the phase tree and never writes a list', () =>
    Effect.gen(function* () {
      const report = yield* runSlash('lock --name ok --phase A', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(report.ok).toBe(false);
      Vitest.expect(report.output).toContain('not locked A');
      Vitest.expect(report.output).toContain('phase.review-missing');
      Vitest.expect(report.output).toContain('task.pending');
    }),
  );

  Vitest.it.effect('stamp prints the one clock in either format', () =>
    Effect.gen(function* () {
      const instant = yield* runSlash('stamp', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(instant.output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      const date = yield* runSlash('stamp --format date', root).pipe(
        Effect.provide(stubLayer(specs)),
      );
      Vitest.expect(date.output).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }),
  );

  Vitest.it.effect('init writes phase directories and list reads the derived lifecycle', () =>
    Effect.gen(function* () {
      const created = new Map(specs);
      const layer = stubLayer(created);
      const report = yield* runSlash('init --name demo --rigor trivial', root).pipe(
        Effect.provide(layer),
      );
      Vitest.expect(report.ok).toBe(true);
      Vitest.expect(report.output).toContain("created 'demo'");
      const files = created.get('demo') ?? [];
      Vitest.expect(files.some((file) => file.path === 'SPEC.md')).toBe(true);
      Vitest.expect(files.some((file) => file.path === 'A/PHASE.md')).toBe(true);
      Vitest.expect(files.some((file) => /^A\/A\d{3}-/.test(file.path))).toBe(true);

      const listed = yield* runSlash('list', root).pipe(Effect.provide(layer));
      Vitest.expect(listed.ok).toBe(true);
      Vitest.expect(listed.output).toContain('demo');
      Vitest.expect(listed.output).not.toContain('locked-phases');
    }),
  );

  Vitest.it.effect('init accepts the documented scope= short form and refuses another token', () =>
    Effect.gen(function* () {
      const created = new Map(specs);
      const layer = stubLayer(created);
      const report = yield* runSlash(
        'init --name demo --rigor trivial --task A:first:execution:medium:scope=app',
        root,
      ).pipe(Effect.provide(layer));
      Vitest.expect(report.ok).toBe(true);
      const task = (created.get('demo') ?? []).find((file) => file.path === 'A/A001-first/TASK.md');
      Vitest.expect(task?.content).toContain('write-scope: app');

      const refused = yield* runSlash(
        'init --name other --rigor trivial --task A:first:execution:medium:typo=1',
        root,
      ).pipe(Effect.provide(layer));
      Vitest.expect(refused.ok).toBe(false);
      Vitest.expect(refused.output).toContain("'typo=1' is not a known task token");
    }),
  );

  Vitest.it.effect('new-phase and new-task allocate phase-tree directories', () =>
    Effect.gen(function* () {
      const created = new Map(specs);
      const layer = stubLayer(created);
      yield* runSlash('init --name grow --rigor standard', root).pipe(Effect.provide(layer));
      const phase = yield* runSlash(
        'new-phase --name grow --objective Ship the second slice --review required',
        root,
      ).pipe(Effect.provide(layer));
      Vitest.expect(phase.ok).toBe(true);
      Vitest.expect(phase.output).toContain('added phase B');

      const task = yield* runSlash(
        'new-task --name grow --phase B --task ship --type execution',
        root,
      ).pipe(Effect.provide(layer));
      Vitest.expect(task.ok).toBe(true);
      Vitest.expect(task.output).toContain('added B001');
      const files = created.get('grow') ?? [];
      Vitest.expect(files.some((file) => file.path === 'B/B001-ship/TASK.md')).toBe(true);
    }),
  );

  Vitest.it.effect('rigor refuses an unknown value and gate needs its subcommand', () =>
    Effect.gen(function* () {
      const rigor = yield* runSlash('rigor split', root).pipe(Effect.provide(stubLayer(specs)));
      Vitest.expect(rigor.ok).toBe(false);
      Vitest.expect(rigor.output).toContain('code     rigor.unknown');

      const gate = yield* runSlash('gate --name ok --phase A', root).pipe(
        Effect.provide(stubLayer(specs)),
        Effect.flip,
      );
      Vitest.expect(gate).toBeInstanceOf(SurfaceError);
      Vitest.expect(slashProblem(gate)).toContain('gate requires `run` or `record`');
    }),
  );
});
