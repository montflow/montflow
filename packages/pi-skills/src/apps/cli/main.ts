#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import * as Command from 'effect/unstable/cli/Command';
import { VERSION, rootCommand } from './binary.apps.module.js';

/**
 * `mf-skills` binary entry.
 *
 * The runtime is Bun and the CLI is `effect/unstable/cli`, matching
 * `mf-features` and `mf-prompts`. `bun build --compile` embeds this runtime,
 * so `dist/mf-skills` is a single file that runs on its target with no install.
 *
 * A failure sets `process.exitCode` rather than calling `process.exit`, so
 * buffered stdout is flushed before the process leaves — piping this into
 * another tool must not truncate the report.
 */
const program = Command.run(rootCommand, { version: VERSION }).pipe(
  Effect.provide(NodeServices.layer),
);

program.pipe(Effect.runPromise).catch(() => {
  process.exitCode = 1;
});
