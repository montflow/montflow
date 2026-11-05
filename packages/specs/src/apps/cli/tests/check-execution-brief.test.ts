import * as Vitest from '@effect/vitest';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path, Scope } from 'effect';

import { SpecStore } from '../../../services/index.js';
import { check, claim, init } from '../index.js';

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const root = '.agents/@montflow/specs';

/** Remove the generated `## Execution Brief` section: it is the last section. */
const stripBrief = (markdown: string): string =>
  markdown.replace(/\n## Execution Brief\s*[\s\S]*$/, '\n');

const fullBrief = [
  '',
  '## Execution Brief',
  '',
  '- Read: this brief, TASK.md, GATES.md, and the scoped source.',
  '- Write scope: this task directory and the files TASK.md names.',
  '- Gate: point at GATES.md; the orchestrator runs it once per task.',
  '- Record: at or under 80 lines, logs in /tmp.',
  '- Review: one fixer attempt and one re-review after review decide.',
  '',
].join('\n');

const withWorkspace = <A, E>(
  body: (
    workspace: string,
  ) => Effect.Effect<A, E, SpecStore.SpecStore | FileSystem.FileSystem | Path.Path>,
): Effect.Effect<A, E, SpecStore.SpecStore | FileSystem.FileSystem | Path.Path | Scope.Scope> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const workspace = yield* fs.makeTempDirectoryScoped().pipe(Effect.orDie);
    return yield* body(workspace);
  });

/**
 * The execution-brief fixture: a real tree scaffolded by `init`, moved to
 * `in-progress` through `claim`, then checked with and without the brief. It
 * exercises the store, the verifier, and the warning end to end.
 */
Vitest.describe('Cli.check execution brief runtime', () => {
  Vitest.it.effect('warns only while an in-progress phase memory lacks the brief', () =>
    withWorkspace((workspace) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const storeRoot = `${workspace}/${root}`;
        yield* init({ root: storeRoot, name: 'demo', rigor: 'trivial' });
        const phaseMemory = `${storeRoot}/demo/A/MEMORY.md`;

        const fresh = yield* check(storeRoot, { name: 'demo' });
        Vitest.expect(fresh.failed).toBe(0);
        Vitest.expect(
          fresh.specs[0]?.issues.some((found) => found.code === 'phase.execution-brief-missing') ??
            false,
        ).toBe(false);

        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          orchestrator: true,
          session: 'sess-orch',
        });
        yield* claim({
          root: storeRoot,
          workspace,
          name: 'demo',
          task: 'A001',
          start: true,
          session: 'sess-orch',
        });

        const scaffolded = yield* fs.readFileString(phaseMemory).pipe(Effect.orDie);
        Vitest.expect(scaffolded).toContain('## Execution Brief');

        const briefed = yield* check(storeRoot, { name: 'demo' });
        Vitest.expect(
          briefed.specs[0]?.issues.some(
            (found) => found.code === 'phase.execution-brief-missing',
          ) ?? false,
        ).toBe(false);

        const withoutBrief = stripBrief(scaffolded);
        Vitest.expect(withoutBrief).not.toContain('## Execution Brief');

        for (const phaseMemoryText of [
          withoutBrief,
          `${withoutBrief}\n## Execution Brief\n`,
          `${withoutBrief}\n## Execution Brief\n\n- TODO.\n`,
        ]) {
          yield* fs.writeFileString(phaseMemory, phaseMemoryText).pipe(Effect.orDie);
          const missing = yield* check(storeRoot, { name: 'demo' });
          Vitest.expect(missing.specs[0]?.issues).toContainEqual(
            Vitest.expect.objectContaining({
              code: 'phase.execution-brief-missing',
              severity: 'warning',
              field: 'A/MEMORY.md',
            }),
          );
          Vitest.expect(missing.failed).toBe(0);
        }

        yield* fs.writeFileString(phaseMemory, `${withoutBrief}${fullBrief}`).pipe(Effect.orDie);
        const restored = yield* check(storeRoot, { name: 'demo' });
        Vitest.expect(
          restored.specs[0]?.issues.some(
            (found) => found.code === 'phase.execution-brief-missing',
          ) ?? false,
        ).toBe(false);
      }),
    ).pipe(Effect.provide(SpecStore.Default), Effect.provide(Platform)),
  );
});
