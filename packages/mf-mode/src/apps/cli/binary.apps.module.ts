import { Console, Effect, Option } from 'effect';
import { Argument, Command, Flag } from 'effect/cli';
import { Cli } from '@montflow/version';
import type { BuildInfo } from '@montflow/version';
import packageJson from '../../../package.json' with { type: 'json' };
import * as Roles from '../../modules/roles/index.js';
import * as Engines from './engines.apps.module.js';
import * as Renderers from './renderers.apps.module.js';
import * as PlaybookEngines from './playbook-engines.apps.module.js';
import * as PlaybookRenderers from './playbook-renderers.apps.module.js';
import * as PrincipleEngines from './principle-engines.apps.module.js';
import * as PrincipleRenderers from './principle-renderers.apps.module.js';
import * as Pr from '../../modules/pr/index.js';
import * as PrEngines from './pr-engines.apps.module.js';
import * as PrRenderers from './pr-renderers.apps.module.js';
import * as ReportEngines from './report-engines.apps.module.js';
import * as ReportRenderers from './report-renderers.apps.module.js';

/**
 * The `mf-mode` binary's command tree, built with `effect/cli`.
 *
 * Every handler is a one-liner over `Engines` plus a `Renderers` function. A
 * refusal prints its fix-it line and sets `process.exitCode` inside the
 * handler, never `process.exit`, so buffered stdout is flushed. `--dir` is the
 * workspace root.
 */

/** This package's root: three levels up from `src/apps/cli`. */
export const PACKAGE_ROOT = `${import.meta.dirname}/../../..`;

export const PACKAGE_IDENTITY = {
  name: packageJson.name,
  version: packageJson.version,
} satisfies BuildInfo.GeneratedIdentity;

export const INVOCATION = Engines.INVOCATION;

/**
 * Every command path this binary accepts. Skill and playbook text may only
 * name these; a test holds the text and the tree to this list.
 */
export const COMMANDS = [
  'doctor',
  'roles',
  'roles show',
  'roles set',
  'roles unset',
  'roles verify',
  'roles resolve',
  'dispatch',
  'verify',
  'principles',
  'principles list',
  'principles show',
  'principles verify',
  'playbooks',
  'playbooks list',
  'playbooks show',
  'playbooks verify',
  'report',
  'pr',
  'pr template',
  'pr check',
  'pr attach',
  'version',
] as const;

export const exitFailed = Effect.sync(() => {
  process.exitCode = 1;
});

const exitWith = (code: number) =>
  Effect.sync(() => {
    process.exitCode = code;
  });

const optionalString = (name: string, description: string) =>
  Flag.String(name).pipe(Flag.withDescription(description), Flag.optional);

const optionalBoolean = (name: string, description: string) =>
  Flag.Boolean(name).pipe(Flag.withDescription(description), Flag.withDefault(false));

const dirFlag = optionalString('dir', 'Workspace root. Defaults to the working directory.');
const humanFlag = optionalBoolean('human', 'Render readable tables and glyphs.');
const verboseFlag = optionalBoolean('verbose', 'Add detail to the same output.');
const harnessFlag = optionalString(
  'harness',
  `The harness you are running in (${Roles.HARNESSES.join(', ')}). Detected when omitted.`,
);
const roleArgument = Argument.String('role').pipe(
  Argument.withDescription(`Role name: ${Roles.ROLES.join(', ')}.`),
);

const rootOf = (dir: Option.Option<string>): string => Option.getOrUndefined(dir) ?? process.cwd();

const refuse = (message: string): Effect.Effect<void> =>
  Console.log(message).pipe(Effect.andThen(exitFailed));

const showHandler = (config: {
  readonly dir: Option.Option<string>;
  readonly human: boolean;
  readonly verbose: boolean;
}) =>
  Engines.show(rootOf(config.dir)).pipe(
    Effect.matchEffect({
      onFailure: refuse,
      onSuccess: (rows) => Console.log(Renderers.show(rows, config)),
    }),
  );

const showConfig = { human: humanFlag, verbose: verboseFlag, dir: dirFlag };

const showCommand = Command.make('show', showConfig, showHandler).pipe(
  Command.withDescription('Print every role: its seats as specs, or `default`.'),
);

const setCommand = Command.make(
  'set',
  {
    role: roleArgument,
    seat: Flag.String('seat').pipe(
      Flag.withDescription(
        'One seat: candidates in preference order, `harness:model[:effort]`, comma-separated. Repeat for each seat of a panel.',
      ),
      Flag.atLeast(1),
    ),
    dir: dirFlag,
  },
  (config) =>
    Engines.set(rootOf(config.dir), config.role, config.seat).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (row) => Console.log(Renderers.changed(row)),
      }),
    ),
).pipe(Command.withDescription('Set one role’s seats. Refuses a combination its harness rejects.'));

const unsetCommand = Command.make('unset', { role: roleArgument, dir: dirFlag }, (config) =>
  Engines.unset(rootOf(config.dir), config.role).pipe(
    Effect.matchEffect({
      onFailure: refuse,
      onSuccess: (row) => Console.log(Renderers.changed(row)),
    }),
  ),
).pipe(Command.withDescription('Remove one role, so it resolves to the mf-mode defaults.'));

const verifyCommand = Command.make(
  'verify',
  { human: humanFlag, verbose: verboseFlag, dir: dirFlag },
  (config) =>
    Effect.gen(function* () {
      const report = yield* Engines.verify(rootOf(config.dir));
      yield* Console.log(Renderers.verify(report, config));
      if (report.errorCount > 0) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Check every candidate against what its harness accepts. Non-zero on any error.',
  ),
);

const resolveCommand = Command.make(
  'resolve',
  {
    role: roleArgument,
    harness: harnessFlag,
    human: humanFlag,
    verbose: verboseFlag,
    dir: dirFlag,
  },
  (config) =>
    Engines.resolve(rootOf(config.dir), config.role, Option.getOrUndefined(config.harness)).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (resolution) => Console.log(Renderers.resolve(resolution, config)),
      }),
    ),
).pipe(
  Command.withDescription(
    'Resolve a role’s seats from this harness: each is `native` (spawn it here), `dispatch` (run `mf-mode dispatch`), or `dropped`.',
  ),
);

const rolesCommand = Command.make('roles', showConfig, showHandler).pipe(
  Command.withDescription(
    'Which harness and model run each role, from .agents/@montflow/mode/roles.json (git-ignored, per user). Bare `roles` is `roles show`.',
  ),
  Command.withSubcommands([showCommand, setCommand, unsetCommand, verifyCommand, resolveCommand]),
);

/** Print text byte for byte: stdout only, never an added newline. */
export const writeRaw = (text: string): Effect.Effect<void> =>
  Effect.sync(() => {
    process.stdout.write(text);
  });

interface StoreCommandSpec<Report, Services> {
  /** Singular noun, for descriptions: `principle`, `playbook`. */
  readonly noun: string;
  /** The store's name, which is also the subcommand: `principles`, `playbooks`. */
  readonly name: string;
  /** Caller form named in fix-it text. */
  readonly invocation: string;
  readonly engines: {
    readonly list: (
      root: string,
    ) => Effect.Effect<ReadonlyArray<{ name: string; description: string }>, string, Services>;
    readonly show: (
      root: string,
      name: string,
      invocation: string,
    ) => Effect.Effect<string, string, Services>;
    readonly verify: (
      root: string,
      options: { name?: string | undefined; all?: boolean | undefined; invocation: string },
    ) => Effect.Effect<Report & { readonly issueCount: number }, string, Services>;
  };
  readonly renderers: {
    readonly list: (
      rows: ReadonlyArray<{ name: string; description: string }>,
      options: { human: boolean; verbose: boolean },
    ) => string;
    readonly verify: (report: Report, options: { human: boolean; verbose: boolean }) => string;
  };
}

/**
 * The `list`, `show`, and `verify` subcommands of one markdown store. The
 * principle and playbook stores differ only in their engines and renderers.
 */
const storeCommand = <Report, Services>(spec: StoreCommandSpec<Report, Services>) => {
  const nameArgument = Argument.String('name').pipe(
    Argument.withDescription(
      `${spec.noun[0]?.toUpperCase()}${spec.noun.slice(1)} name (the directory slug).`,
    ),
  );
  const listSub = Command.make(
    'list',
    { human: humanFlag, verbose: verboseFlag, dir: dirFlag },
    (config) =>
      spec.engines.list(rootOf(config.dir)).pipe(
        Effect.matchEffect({
          onFailure: refuse,
          onSuccess: (rows) => Console.log(spec.renderers.list(rows, config)),
        }),
      ),
  ).pipe(
    Command.withDescription(
      `Print the index: one \`<name>: <description>\` line per ${spec.noun}.`,
    ),
  );
  const showSub = Command.make('show', { name: nameArgument, dir: dirFlag }, (config) =>
    spec.engines
      .show(rootOf(config.dir), config.name, spec.invocation)
      .pipe(Effect.matchEffect({ onFailure: refuse, onSuccess: writeRaw })),
  ).pipe(Command.withDescription(`Print one ${spec.noun}’s file bytes, unchanged.`));
  const verifySub = Command.make(
    'verify',
    {
      name: Argument.String('name').pipe(
        Argument.withDescription(
          `${spec.noun[0]?.toUpperCase()}${spec.noun.slice(1)} name. Omit to verify the whole store.`,
        ),
        Argument.optional,
      ),
      all: optionalBoolean('all', `Verify every ${spec.noun} in the store.`),
      human: humanFlag,
      verbose: verboseFlag,
      dir: dirFlag,
    },
    (config) =>
      Effect.gen(function* () {
        const report = yield* spec.engines.verify(rootOf(config.dir), {
          name: Option.getOrUndefined(config.name),
          all: config.all,
          invocation: spec.invocation,
        });
        yield* Console.log(spec.renderers.verify(report, config));
        // Warnings do not fail: only an error-severity finding does.
        if (report.issueCount > 0) yield* exitFailed;
      }).pipe(Effect.catch(refuse)),
  ).pipe(Command.withDescription(`Mechanically verify ${spec.noun} files. Non-zero on any error.`));
  return Command.make(spec.name).pipe(
    Command.withDescription(
      `Inspect and verify the ${spec.name} in .agents/@montflow/${spec.name}: \`list\`, \`show\`, \`verify\`.`,
    ),
    Command.withSubcommands([listSub, showSub, verifySub]),
  );
};

const principlesCommand = storeCommand({
  noun: 'principle',
  name: 'principles',
  invocation: `${INVOCATION} principles`,
  engines: PrincipleEngines,
  renderers: PrincipleRenderers,
});

const playbooksCommand = storeCommand({
  noun: 'playbook',
  name: 'playbooks',
  invocation: `${INVOCATION} playbooks`,
  engines: PlaybookEngines,
  renderers: PlaybookRenderers,
});

const doctorCommand = Command.make(
  'doctor',
  {
    check: optionalBoolean('check', 'Report only; write nothing. Non-zero when unhealthy.'),
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const result = yield* Engines.doctor(rootOf(config.dir), config.check);
      yield* Console.log(result.message);
      if (!result.healthy) yield* exitFailed;
    }),
).pipe(
  Command.withDescription(
    'Install or verify everything mf-mode ships: skills (.agents/skills), profiles (.agents/@montflow/profiles), principles (.agents/@montflow/principles) and playbooks (.agents/@montflow/playbooks).',
  ),
);

/**
 * `verify`: every store the binary owns, in one run: the roles file, then the
 * principles, then the playbooks (which resolve against the other two). Each
 * section prints under a `section=<name>` line; the exit code is non-zero when
 * any section has an error or cannot be read.
 */
const verifyAllCommand = Command.make(
  'verify',
  { human: humanFlag, verbose: verboseFlag, dir: dirFlag },
  (config) =>
    Effect.gen(function* () {
      const root = rootOf(config.dir);
      const sections: ReadonlyArray<{
        readonly name: string;
        readonly run: Effect.Effect<
          { readonly text: string; readonly errors: number },
          string,
          never
        >;
      }> = [
        {
          name: 'roles',
          run: Engines.verify(root).pipe(
            Effect.map((report) => ({
              text: Renderers.verify(report, config),
              errors: report.errorCount,
            })),
            Effect.provide(Engines.StoreLive),
          ),
        },
        {
          name: 'principles',
          run: PrincipleEngines.verify(root, {
            all: true,
            invocation: `${INVOCATION} principles`,
          }).pipe(
            Effect.map((report) => ({
              text: PrincipleRenderers.verify(report, config),
              errors: report.issueCount,
            })),
            Effect.provide(Engines.Live),
          ),
        },
        {
          name: 'playbooks',
          run: PlaybookEngines.verify(root, {
            all: true,
            invocation: `${INVOCATION} playbooks`,
          }).pipe(
            Effect.map((report) => ({
              text: PlaybookRenderers.verify(report, config),
              errors: report.issueCount,
            })),
            Effect.provide(Engines.Live),
          ),
        },
      ];
      let failed = false;
      for (const section of sections) {
        yield* Console.log(`section=${section.name}`);
        const outcome = yield* section.run.pipe(
          Effect.catch((message) => Effect.succeed({ text: message, errors: 1 })),
        );
        yield* Console.log(outcome.text);
        if (outcome.errors > 0) failed = true;
      }
      if (failed) yield* exitFailed;
    }),
).pipe(
  Command.withDescription(
    'Verify everything mf-mode owns: roles, principles, and playbooks. Non-zero on any error.',
  ),
);

const dispatchCommand = Command.make(
  'dispatch',
  {
    role: roleArgument,
    seat: Flag.Int('seat').pipe(
      Flag.withDescription('The seat number from `mf-mode roles resolve`.'),
      Flag.withDefault(1),
    ),
    brief: Flag.String('brief').pipe(Flag.withDescription('File holding the kickoff brief.')),
    profile: Flag.String('profile').pipe(
      Flag.withDescription('Profile the worker runs as, or `none`.'),
      Flag.withDefault(Engines.DEFAULT_PROFILE),
    ),
    readOnly: optionalBoolean('read-only', 'The worker may read and run read-only tools only.'),
    harness: harnessFlag,
    dryRun: optionalBoolean('dry-run', 'Print the seat and the exact command; run nothing.'),
    dir: dirFlag,
  },
  (config) =>
    Engines.dispatch(rootOf(config.dir), {
      role: config.role,
      seat: config.seat,
      brief: config.brief,
      profile: config.profile,
      access: config.readOnly ? 'read-only' : 'write',
      harness: Option.getOrUndefined(config.harness),
      dryRun: config.dryRun,
    }).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (result) =>
          result.exitCode === undefined
            ? Console.log(Renderers.dispatchPlan(result))
            : result.exitCode === 0
              ? Effect.void
              : exitWith(result.exitCode),
      }),
    ),
).pipe(
  Command.withDescription(
    'Run one dispatch seat headless on the harness it resolves to, as a profile (default mf-mode-generic-worker). Its report is printed on stdout. Refuses a native or dropped seat.',
  ),
);

const reportCommand = Command.make(
  'report',
  {
    trace: Argument.String('trace').pipe(
      Argument.withDescription('The mf-mode-observe trace: one JSON event per line.'),
    ),
    out: optionalString('out', 'Directory for the files. Defaults to the trace’s directory.'),
    title: optionalString('title', 'Report title. Defaults to the run.start summary.'),
    browser: optionalString(
      'browser',
      'Chromium-family browser for the PNG and PDF. Found when omitted: MF_MODE_BROWSER, PATH, a Playwright headless shell, then /Applications.',
    ),
    theme: Flag.String('theme').pipe(
      Flag.withDescription(`Theme of the PNG: ${ReportEngines.THEMES.join(', ')}.`),
      Flag.withDefault('light'),
    ),
    noImages: optionalBoolean('no-images', 'Write the HTML only.'),
    dir: dirFlag,
  },
  (config) =>
    ReportEngines.report({
      root: rootOf(config.dir),
      trace: config.trace,
      out: Option.getOrUndefined(config.out),
      title: Option.getOrUndefined(config.title),
      browser: Option.getOrUndefined(config.browser),
      images: !config.noImages,
      theme: config.theme,
    }).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (result) => Console.log(ReportRenderers.report(result)),
      }),
    ),
).pipe(
  Command.withDescription(
    'Render an mf-mode-observe trace into <name>.report.html, plus a PNG of its summary and a PDF of the page when a Chromium-family browser is found. A missing browser skips the images and still exits 0.',
  ),
);

const prTemplateCommand = Command.make('template', {}, () => writeRaw(Pr.template())).pipe(
  Command.withDescription('Print the PR body skeleton: every section of the standard, in order.'),
);

const prCheckCommand = Command.make(
  'check',
  {
    bodyFile: Flag.String('body-file').pipe(Flag.withDescription('File holding the PR body.')),
    title: optionalString('title', 'The PR title, checked as Conventional Commits.'),
    human: humanFlag,
    dir: dirFlag,
  },
  (config) =>
    Effect.gen(function* () {
      const report = yield* PrEngines.check({
        root: rootOf(config.dir),
        bodyFile: config.bodyFile,
        title: Option.getOrUndefined(config.title),
      });
      yield* Console.log(Pr.render(report, { human: config.human }));
      if (report.errors > 0) yield* exitFailed;
    }).pipe(Effect.catch(refuse)),
).pipe(
  Command.withDescription(
    'Hold a PR body to the standard before publishing: errors (non-zero exit) and hints, each with its fix.',
  ),
);

const prAttachCommand = Command.make(
  'attach',
  {
    files: Argument.String('file').pipe(
      Argument.withDescription('Files to attach: report PNG and PDF, screenshots.'),
      Argument.variadic({ min: 1 }),
    ),
    branch: optionalString('branch', 'Assets branch. Defaults to assets/<current branch>.'),
    remote: Flag.String('remote').pipe(
      Flag.withDescription('Remote to push to.'),
      Flag.withDefault('origin'),
    ),
    repo: optionalString('repo', 'owner/name, when the remote URL is not on GitHub.'),
    dir: dirFlag,
  },
  (config) =>
    PrEngines.attach({
      root: rootOf(config.dir),
      files: config.files,
      branch: Option.getOrUndefined(config.branch),
      remote: config.remote,
      repo: Option.getOrUndefined(config.repo),
    }).pipe(
      Effect.matchEffect({
        onFailure: refuse,
        onSuccess: (result) => Console.log(PrRenderers.attached(result)),
      }),
    ),
).pipe(
  Command.withDescription(
    'Push files to an orphan assets branch on GitHub and print markdown that shows them in a PR body. Nothing reaches the PR’s own branch.',
  ),
);

const prCommand = Command.make('pr').pipe(
  Command.withDescription(
    'The PR body standard: `template` prints the skeleton, `check` holds a body to it, `attach` hosts proof files.',
  ),
  Command.withSubcommands([prTemplateCommand, prCheckCommand, prAttachCommand]),
);

/** The root command the binary runs. */
export const rootCommand = Command.make(INVOCATION).pipe(
  Command.withDescription(
    'mf-mode: roles and dispatch (which harness and model run delegated work), the principle and playbook stores, run reports, and the PR body standard.',
  ),
  Command.withSubcommands([
    doctorCommand,
    rolesCommand,
    dispatchCommand,
    verifyAllCommand,
    principlesCommand,
    playbooksCommand,
    reportCommand,
    prCommand,
    Cli.versionCommand({ packageRoot: PACKAGE_ROOT, generated: PACKAGE_IDENTITY }),
  ]),
  Command.provide(Engines.Live),
);
