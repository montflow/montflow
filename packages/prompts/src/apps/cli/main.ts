#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { VERSION, rootCommand } from './binary.apps.module.js';

/**
 * `mf-prompts` binary entry.
 *
 * The runtime is Bun and the CLI is `effect/cli`, matching
 * `mf-specs`. `bun build --compile` embeds this runtime, so
 * `dist/mf-prompts` is a single file that runs on its target with no install.
 *
 * A failure sets `process.exitCode` rather than calling `process.exit`, so
 * buffered stdout is flushed before the process leaves — piping this into
 * another tool must not truncate the report.
 */
const program = Command.run(rootCommand, { version: VERSION }).pipe(
  Effect.provide(NodeServices.layer),
);

program.pipe(Effect.runPromise).catch(() => {
  // effect/cli already rendered the cause; only the exit code is ours.
  process.exitCode = 1;
});
