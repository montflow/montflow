// oxlint-disable-next-line montflow/no-node-platform-imports -- Host.Default is the package's single process seam: PATH probes and the dispatch spawn, argv-only, no shell.
import { spawn } from 'node:child_process';
// oxlint-disable-next-line montflow/no-node-platform-imports -- PATH probing needs an executable-bit check, which the Effect FileSystem does not expose.
import * as Fs from 'node:fs';
// oxlint-disable-next-line montflow/no-node-platform-imports -- PATH is split with the platform's delimiter.
import * as NodePath from 'node:path';
import { Context, Effect, Layer } from 'effect';
import type * as Dispatch from '../../modules/dispatch/index.js';

/**
 * The process the CLI runs in: its environment, which executables are on
 * `PATH`, the spawn `dispatch` makes, and the captured runs `report` (a
 * headless browser) and `pr attach` (git) make. Tests provide a fake.
 */

export interface Impl {
  /** The process environment, read once. */
  readonly env: Readonly<Record<string, string | undefined>>;
  /** Whether an executable is on `PATH`. */
  readonly installed: (binary: string) => Effect.Effect<boolean>;
  /**
   * Run a dispatch plan with inherited stdout and stderr in `cwd`.
   * @returns the child's exit code; 127 when the binary cannot be spawned
   */
  readonly run: (plan: Dispatch.Plan, cwd: string) => Effect.Effect<number>;
  /**
   * Run a binary to its end and capture what it printed. Argv only, no shell.
   * @returns the exit code (127 when it cannot be spawned, 124 past the timeout), stdout and stderr
   */
  readonly exec: (
    binary: string,
    args: ReadonlyArray<string>,
    options?: ExecOptions,
  ) => Effect.Effect<Captured>;
}

export interface ExecOptions {
  readonly cwd?: string | undefined;
  readonly stdin?: string | undefined;
  /** Stop the child after this long. Default one minute. */
  readonly timeoutMs?: number | undefined;
}

export interface Captured {
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

export const Id = '@montflow/ModeHost';
export type Id = typeof Id;

export class Host extends Context.Service<Host, Impl>()(Id) {}

const environment = (): Readonly<Record<string, string | undefined>> =>
  // oxlint-disable-next-line montflow/no-process-env -- the binary's composition root: harness detection reads the environment the CLI runs under.
  process.env;

const executable = (file: string): boolean => {
  try {
    Fs.accessSync(file, Fs.constants.X_OK);
    return Fs.statSync(file).isFile();
  } catch {
    return false;
  }
};

const make = (): Impl => {
  const env = environment();
  return {
    env,
    installed: (binary) =>
      Effect.sync(() =>
        (env['PATH'] ?? '')
          .split(NodePath.delimiter)
          .filter((dir) => dir.length > 0)
          .some((dir) => executable(NodePath.join(dir, binary))),
      ),
    run: (plan, cwd) =>
      Effect.callback<number>((resume) => {
        const child = spawn(plan.binary, [...plan.args], {
          cwd,
          env: { ...env, ...plan.env },
          stdio: [plan.stdin === undefined ? 'ignore' : 'pipe', 'inherit', 'inherit'],
        });
        child.on('error', () => resume(Effect.succeed(127)));
        child.on('close', (code) => resume(Effect.succeed(code ?? 1)));
        if (plan.stdin !== undefined && child.stdin !== null) child.stdin.end(plan.stdin);
      }),
    exec: (binary, args, options = {}) =>
      Effect.callback<Captured>((resume) => {
        const out: Array<Buffer> = [];
        const err: Array<Buffer> = [];
        const child = spawn(binary, [...args], {
          cwd: options.cwd,
          env,
          timeout: options.timeoutMs ?? 60_000,
          stdio: [options.stdin === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
        });
        child.stdout?.on('data', (chunk: Buffer) => out.push(chunk));
        child.stderr?.on('data', (chunk: Buffer) => err.push(chunk));
        child.on('error', (error) =>
          resume(Effect.succeed({ code: 127, stdout: '', stderr: error.message })),
        );
        child.on('close', (code, signal) =>
          resume(
            Effect.succeed({
              code: signal === 'SIGTERM' ? 124 : (code ?? 1),
              stdout: Buffer.concat(out).toString('utf8'),
              stderr: Buffer.concat(err).toString('utf8'),
            }),
          ),
        );
        if (options.stdin !== undefined && child.stdin !== null) child.stdin.end(options.stdin);
      }),
  };
};

export const Default = Layer.sync(Host, make);

/**
 * A host with a fixed environment, a fixed set of installed binaries, and a
 * recorder in place of the spawn.
 * @param options - env, installed binaries, and the exit code `run` returns
 */
export const fake = (options: {
  readonly env?: Readonly<Record<string, string | undefined>>;
  readonly installed?: ReadonlyArray<string>;
  readonly exitCode?: number;
  readonly runs?: Array<Dispatch.Plan>;
  /** Answers each `exec`; without it every binary is missing (127). */
  readonly exec?: (binary: string, args: ReadonlyArray<string>, options: ExecOptions) => Captured;
}): Layer.Layer<Host> =>
  Layer.succeed(Host, {
    env: options.env ?? {},
    installed: (binary) => Effect.succeed((options.installed ?? []).includes(binary)),
    run: (plan) =>
      Effect.sync(() => {
        options.runs?.push(plan);
        return options.exitCode ?? 0;
      }),
    exec: (binary, args, execOptions = {}) =>
      Effect.sync(
        () =>
          options.exec?.(binary, args, execOptions) ?? { code: 127, stdout: '', stderr: 'missing' },
      ),
  });
