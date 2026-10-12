import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ReviewStore } from '../../../services/index.js';
import * as Dispatch from '../index.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.provide(ReviewStore.Default, NodeLive);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-dispatch-'));

Vitest.describe('review dispatch', () => {
  Vitest.it('builds a prompt naming the series and its context', () => {
    const prompt = Dispatch.reviewerPrompt({
      root: '/repo',
      name: 'ship-spec-a',
      target: 'the phase',
      spec: 'ship-spec',
    });
    Vitest.expect(prompt).toContain("series 'ship-spec-a'");
    Vitest.expect(prompt).toContain('montflow-adversarial-review');
    Vitest.expect(prompt).toContain('- Spec: ship-spec');
    Vitest.expect(prompt).toContain('- Workspace root: /repo');
  });

  Vitest.it.effect('ensures the series, then fails cleanly without a session runner host', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const error = yield* Dispatch.startReview({ root, name: 'demo' }).pipe(Effect.flip);
      Vitest.expect(error).toContain('sessions extension');
      const ledger = yield* Effect.promise(() =>
        readFile(join(root, '.agents', '@montflow', 'reviews', 'demo', 'REVIEW.md'), 'utf8'),
      );
      Vitest.expect(ledger).toContain('# Review Series: demo');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
