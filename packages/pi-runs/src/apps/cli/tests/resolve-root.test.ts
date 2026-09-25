import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { resolveRepoRoot } from '../index.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

Vitest.describe('resolveRepoRoot', () => {
  Vitest.it.effect('finds the nearest ancestor with a .git entry', () => {
    const root = mkdtempSync(join(tmpdir(), 'mf-runs-root-'));
    return Effect.gen(function* () {
      try {
        mkdirSync(join(root, '.git'));
        const nested = join(root, 'packages', 'foo');
        mkdirSync(nested, { recursive: true });
        Vitest.expect(yield* resolveRepoRoot(nested)).toBe(root);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeLive));
  });

  Vitest.it.effect('treats a .git file (worktree) as a repository marker', () => {
    const root = mkdtempSync(join(tmpdir(), 'mf-runs-root-'));
    return Effect.gen(function* () {
      try {
        writeFileSync(join(root, '.git'), 'gitdir: /elsewhere\n');
        const nested = join(root, 'a', 'b');
        mkdirSync(nested, { recursive: true });
        Vitest.expect(yield* resolveRepoRoot(nested)).toBe(root);
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    }).pipe(Effect.provide(NodeLive));
  });

  Vitest.it.effect('falls back to the start directory at the filesystem root', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* resolveRepoRoot('/')).toBe('/');
    }).pipe(Effect.provide(NodeLive)),
  );
});
