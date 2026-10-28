#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/unstable/cli';
import { VERSION, rootCommand } from './binary.apps.module.js';

/**
 * `mf-model-fallback` binary entry. The build (`bun build --compile`) embeds
 * this runtime, so `dist/mf-model-fallback` runs with no install.
 *
 * A failure sets `process.exitCode` rather than calling `process.exit`, so
 * buffered stdout is flushed before the process leaves.
 */
const program = Command.run(rootCommand, { version: VERSION }).pipe(
  Effect.provide(NodeServices.layer),
);

program.pipe(Effect.runPromise).catch(() => {
  process.exitCode = 1;
});
