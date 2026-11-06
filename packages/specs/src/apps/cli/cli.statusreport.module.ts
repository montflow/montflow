import { Console, Effect, FileSystem } from 'effect';
import { Command, Flag } from 'effect/cli';
import { PromptStore } from '@montflow/prompts';
import {
  type LoadedPrompt,
  type PromptError,
  load as loadPrompt,
} from '../../modules/prompt/index.js';

import { SpecStore } from '../../services/index.js';

import {
  storeDirOf,
  GUARD_RERUN,
  SurfaceError,
  guardSpecName,
  guardFailure,
  runDiagnosed,
  verboseFlag,
  nameFlag,
  opt,
  workspaceRoot,
  workspaceDirFlag,
} from './cli.shared.module.js';
import { unknownSpecDiagnostic, which } from './cli.apps.module.js';

/** Options shared by the binary, slash, and host status-report surfaces. */
export interface StatusPromptOptions {
  /** Explicit spec name; wins over branch detection. */
  readonly name?: string | undefined;
  /** Extra direction to steer the report. */
  readonly focus?: string | undefined;
  /** Branch to resolve when `name` is absent (tests and CI). */
  readonly branch?: string | undefined;
  /** Workspace root that holds `.git` and the prompts; defaults to the working directory. */
  readonly workspace?: string | undefined;
}

/** The resolved spec plus the rendered read-only report prompt. */
export interface StatusPromptReport {
  /** The one spec the report covers. */
  readonly name: string;
  /** The rendered `spec-status` prompt and its declared skills. */
  readonly prompt: LoadedPrompt;
}

/** The shipped prompt every status-report surface renders. */
export const STATUS_PROMPT = 'spec-status';

/**
 * Resolve one spec and render the shipped read-only status prompt. The spec is
 * resolved mechanically: an explicit `name` always wins, otherwise `which`
 * reads the branch through the same resolver `execute` uses. Because the report
 * itself is prompt-only, this engine reads no spec content — only its
 * existence — so a broken or unreadable spec still renders and reports its own
 * terminal state. It writes nothing, dispatches nothing, and changes no git
 * state.
 * @param root - spec root directory
 * @param options - name/focus plus the workspace and branch override
 * @returns the resolved name plus the rendered prompt
 */
export const statusReport = (
  root: string,
  options: StatusPromptOptions = {},
): Effect.Effect<
  StatusPromptReport,
  SurfaceError | SpecStore.StoreError | PromptError,
  SpecStore.SpecStore | FileSystem.FileSystem | PromptStore.PromptStore
> =>
  Effect.gen(function* () {
    const operation = 'SpecStatusReport';
    yield* guardFailure(
      operation,
      options.name === undefined
        ? undefined
        : guardSpecName(options.name, GUARD_RERUN.statusReport),
    );

    const store = yield* SpecStore.SpecStore;
    if (!(yield* store.hasRoot(root))) {
      return yield* Effect.fail(
        new SpecStore.StoreError({
          operation,
          reason: `Specs directory not found: ${root}`,
        }),
      );
    }

    const workspace = options.workspace ?? '.';
    const name =
      options.name === undefined
        ? (yield* which(root, { branch: options.branch, workspace })).name
        : options.name;

    if (!(yield* store.exists(root, name))) {
      return yield* Effect.fail(
        new SurfaceError({ operation, diagnostics: [unknownSpecDiagnostic(name)] }),
      );
    }

    // The rendered command forms must point at the same store this call read,
    // so an explicit `--dir` is carried into the prompt instead of `$PWD`.
    const base = { name, root: workspace };
    const values =
      options.focus === undefined || options.focus === ''
        ? base
        : { ...base, focus: options.focus };
    const prompt = yield* loadPrompt(workspace, STATUS_PROMPT, values);
    return { name, prompt };
  });

/**
 * `status-report`: render and print the read-only `spec-status` prompt for one
 * spec. An omitted `--name` resolves through the branch; a failed resolution
 * prints the candidates and asks the user. It performs no write, dispatch, or
 * git mutation.
 */
export const statusReportCommand = Command.make(
  'status-report',
  {
    dir: workspaceDirFlag,
    name: Flag.optional(nameFlag),
    focus: Flag.optional(
      Flag.String('focus').pipe(
        Flag.withDescription('Extra direction to steer the read-only report.'),
      ),
    ),
    verbose: verboseFlag,
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(opt(config.dir));
        const report = yield* statusReport(storeDirOf(workspace), {
          name: opt(config.name),
          focus: opt(config.focus),
          workspace,
        });
        yield* Console.log(report.prompt.text);
      }),
      () => ({
        path: opt(config.dir) ?? '.',
        rerun: 'mf-specs status-report',
        verbose: config.verbose,
      }),
    ),
).pipe(
  Command.withDescription(
    'Render the read-only spec-status prompt for one spec. Reads and prints only; writes nothing, dispatches nothing.',
  ),
  Command.provide(SpecStore.Default),
  Command.provide(PromptStore.Default),
);
