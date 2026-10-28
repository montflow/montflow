#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import { Command } from 'effect/cli';
import { rootCommand } from './cli.apps.module.js';

const program = Command.run(rootCommand, { version: '0.0.1' }).pipe(
  Effect.provide(NodeServices.layer),
);

program.pipe(Effect.runPromise).catch(() => {
  // effect/cli already rendered the cause; only the exit code is ours.
  process.exitCode = 1;
});
