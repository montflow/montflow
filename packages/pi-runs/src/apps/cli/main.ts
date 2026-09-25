#!/usr/bin/env bun
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { ConsoleBridge, runnerLayer } from '../runtime/index.js';
import { resolveRepoRoot, runCli } from './cli.apps.module.js';

const program = Effect.gen(function* () {
  const root = yield* resolveRepoRoot(process.cwd());
  return yield* runCli(process.argv.slice(2), root).pipe(
    Effect.provide(runnerLayer({ root, bridge: ConsoleBridge })),
  );
});

program
  .pipe(
    Effect.tap((text) => Effect.sync(() => console.log(text))),
    Effect.catch((error) =>
      Effect.sync(() => {
        console.error(error);
        process.exitCode = 1;
      }),
    ),
    Effect.provide(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer)),
    Effect.runPromise,
  )
  .catch(() => undefined);
