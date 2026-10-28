#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { rootCommand } from './cli.apps.module.js';

const program = Command.run(rootCommand, { version: '0.0.1' }).pipe(
  Effect.provide(NodeServices.layer),
);

// SAFETY: the platform layer supplies every Command.run environment service;
// the CLI's generic requirement stays opaque after `provide`.
const runnable = program as Effect.Effect<void, unknown>;
runnable.pipe(Effect.runPromise).catch((cause: unknown) => {
  // A silent non-zero exit hides the cause the CLI already rendered; keep it.
  process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
  process.exitCode = 1;
});
