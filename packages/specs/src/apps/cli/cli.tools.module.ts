import { Effect, FileSystem } from 'effect';
import { Command, Flag } from 'effect/cli';

import * as Tools from '../../modules/tools/index.js';
import { renderDiagnostics } from '../../modules/diagnostic/index.js';

import {
  diagnosticOfIssue,
  finish,
  opt,
  runDiagnosed,
  SURFACE_CODES,
  SurfaceError,
  diagnostic,
  workspaceDirFlag,
  workspaceRoot,
} from './cli.shared.module.js';

/** One tools run: text to print and the exit code it implies. */
export interface ToolsRun {
  readonly output: string;
  readonly exitCode: number;
}

/** How to run: report only, or write the section when it is missing or stale. */
export interface ToolsOptions {
  /** Report only — never write. */
  readonly check?: boolean;
}

/** Absolute `<workspace>/AGENTS.md`. */
export const agentsFileOf = (root: string): string =>
  `${root.replace(/\/+$/, '')}/${Tools.AGENTS_FILE}`;

/** Diagnostic for a workspace with no `AGENTS.md` to check. */
export const missingAgentsDiagnostic = (path: string): SurfaceError =>
  new SurfaceError({
    operation: 'SpecsTools',
    diagnostics: [
      diagnostic({
        code: SURFACE_CODES.store,
        path,
        field: Tools.AGENTS_FILE,
        problem: `No ${Tools.AGENTS_FILE} at '${path}'.`,
        rerun: `${Tools.CHECK_COMMAND} --dir <workspace>`,
        expected: `a workspace root holding ${Tools.AGENTS_FILE}`,
        actual: 'missing file',
        fix: `Run from a workspace that has ${Tools.AGENTS_FILE}, or pass --dir <workspace>.`,
      }),
    ],
  });

/**
 * Check the workspace `AGENTS.md` `## Tools` section, and in repair mode write
 * the canonical section when it is missing or stale. Check mode never writes.
 * @param root - workspace root that owns `AGENTS.md`
 * @param options - set `check` to report without writing
 * @returns the rendered report and the exit code it implies
 */
export const runTools = (
  root: string,
  options: ToolsOptions = {},
): Effect.Effect<ToolsRun, SurfaceError, FileSystem.FileSystem> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = agentsFileOf(root);
    const present = yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false));
    if (!present) return yield* Effect.fail(missingAgentsDiagnostic(path));
    const text = yield* fs.readFileString(path).pipe(
      Effect.mapError(
        (cause) =>
          new SurfaceError({
            operation: 'SpecsTools',
            diagnostics: [
              diagnostic({
                code: SURFACE_CODES.store,
                path,
                field: Tools.AGENTS_FILE,
                problem: `Cannot read '${path}'.`,
                rerun: `${Tools.CHECK_COMMAND} --dir <workspace>`,
                expected: 'a readable AGENTS.md',
                actual: 'unreadable file',
                fix: `Check the file permissions on '${path}'.`,
                cause,
              }),
            ],
          }),
      ),
    );
    const found = Tools.verifyAgentsTools(text);
    if (found.valid)
      return { output: `\u2713 ${Tools.AGENTS_FILE} \u00b7 '## Tools' current`, exitCode: 0 };
    if (options.check === true) {
      const diagnostics = found.issues.map((issue) =>
        diagnosticOfIssue(Tools.AGENTS_FILE, issue, Tools.CHECK_COMMAND),
      );
      return { output: renderDiagnostics(diagnostics), exitCode: 1 };
    }
    const repaired = Tools.addToolsSection(text);
    if (repaired === text) {
      return { output: `\u2713 ${Tools.AGENTS_FILE} \u00b7 '## Tools' current`, exitCode: 0 };
    }
    yield* fs.writeFileString(path, repaired).pipe(
      Effect.mapError(
        (cause) =>
          new SurfaceError({
            operation: 'SpecsTools',
            diagnostics: [
              diagnostic({
                code: SURFACE_CODES.store,
                path,
                field: Tools.AGENTS_FILE,
                problem: `Cannot write '${path}'.`,
                rerun: Tools.REPAIR_COMMAND,
                expected: 'a writable AGENTS.md',
                actual: 'write refused',
                fix: `Check the file permissions on '${path}'.`,
                cause,
              }),
            ],
          }),
      ),
    );
    const rows = Tools.CLI_TOOLS.length;
    return {
      output: `wrote ${Tools.AGENTS_FILE} \u00b7 '## Tools' with ${rows} row${rows === 1 ? '' : 's'}`,
      exitCode: 0,
    };
  });

/**
 * `tools`: check the workspace `AGENTS.md` `## Tools` section and, unless
 * `--check` is set, write it. The section names each CLI utility and what it
 * answers, so a reader asks the binary instead of re-deriving state from files.
 */
export const toolsCommand = Command.make(
  'tools',
  {
    dir: workspaceDirFlag,
    check: Flag.Boolean('check').pipe(
      Flag.withDescription(
        'Report only; never write. Exits non-zero when the tools section is missing or stale.',
      ),
      Flag.withDefault(false),
    ),
  },
  (config) =>
    runDiagnosed(
      Effect.gen(function* () {
        const workspace = yield* workspaceRoot(opt(config.dir));
        const report = yield* runTools(workspace, { check: config.check });
        yield* finish(report.output, report.exitCode);
      }),
      () => ({
        path: Tools.AGENTS_FILE,
        rerun: config.check ? Tools.CHECK_COMMAND : Tools.REPAIR_COMMAND,
        verbose: false,
      }),
    ),
).pipe(
  Command.withDescription(
    'Check or write the workspace AGENTS.md `## Tools` table of CLI utilities.',
  ),
);
