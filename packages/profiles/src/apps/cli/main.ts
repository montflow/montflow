#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { VERSION, rootCommand } from './binary.apps.module.js';

/**
 * `mf-profiles` binary entry.
 *
 * The runtime is Bun and the CLI is `effect/cli`, matching the other
 * `mf-*` binaries. `bun build --compile` embeds this runtime, so
 * `dist/mf-profiles` is a single file. A failure sets `process.exitCode` rather
 * than calling `process.exit`, so buffered stdout is flushed before the process
 * leaves.
 */
const program = Command.run(rootCommand, { version: VERSION }).pipe(
  Effect.provide(NodeServices.layer),
);

program.pipe(Effect.runPromise).catch((cause: unknown) => {
  // A silent non-zero exit hides the cause the CLI already rendered; keep it.
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
