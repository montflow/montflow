#!/usr/bin/env bun
import { NodeServices } from '@effect/platform-node';
import { Effect } from 'effect';
import * as Command from 'effect/unstable/cli/Command';
import { rootCommand } from './cli.apps.module.js';

const program = Command.run(rootCommand, { version: '0.0.1' }).pipe(
  Effect.provide(NodeServices.layer),
);

program.pipe(Effect.runPromise).catch(() => {
  process.exitCode = 1;
});
