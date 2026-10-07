#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { ProfileStore } from '../../services/index.js';
import { renderVerifyAll, verifyAll } from './engines.apps.module.js';

/**
 * `mf-profiles` binary entry — the headless half of the profiles extension.
 *
 * The Pi slash command (`/mf-profiles-cli`) needs a live session; this binary
 * needs none, so the CI gate can verify the profiles store directly. Only the
 * `verify` verb exists for now; it is the one the gate depends on.
 *
 * A failure sets `process.exitCode` rather than calling `process.exit`, so
 * buffered stdout is flushed before the process leaves.
 */
const USAGE = 'Usage: mf-profiles verify [--dir <path>]';

/** The `--dir` value, accepting `--dir <path>` and `--dir=<path>`. */
const resolveDir = (argv: readonly string[]): string => {
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? '';
    if (token === '--dir') return argv[index + 1] ?? process.cwd();
    if (token.startsWith('--dir=')) return token.slice('--dir='.length) || process.cwd();
  }
  return process.cwd();
};

/** Bare positionals, skipping flags and the value that follows `--dir`. */
const positionalsOf = (argv: readonly string[]): ReadonlyArray<string> => {
  const positionals: Array<string> = [];
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index] ?? '';
    if (token === '--dir') {
      index++;
      continue;
    }
    if (token.startsWith('-')) continue;
    positionals.push(token);
  }
  return positionals;
};

const argv = process.argv.slice(2);
const verb = positionalsOf(argv)[0];

if (verb !== undefined && verb !== 'verify') {
  console.error(`mf-profiles: unknown command '${verb}'. ${USAGE}`);
  process.exitCode = 1;
} else {
  const program = Effect.gen(function* () {
    const report = yield* verifyAll(resolveDir(argv)).pipe(Effect.provide(ProfileStore.Default));
    yield* Effect.sync(() => console.log(renderVerifyAll(report)));
    if (report.issueCount > 0) {
      yield* Effect.sync(() => {
        process.exitCode = 1;
      });
    }
  });
  program.pipe(Effect.provide(NodeServices.layer), Effect.runPromise).catch((cause: unknown) => {
    console.error(cause instanceof Error ? cause.message : String(cause));
    process.exitCode = 1;
  });
}
