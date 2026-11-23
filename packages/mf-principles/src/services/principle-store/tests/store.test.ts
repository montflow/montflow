import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { PrincipleStore } from '../index.js';

const TestLive = Layer.provide(
  PrincipleStore.Default,
  Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer),
);

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-principles-store-'));

const write = (root: string, name: string, text: string): void => {
  const dir = NodePath.join(root, '.agents', '@montflow', 'principles', name);
  Fs.mkdirSync(dir, { recursive: true });
  Fs.writeFileSync(NodePath.join(dir, 'PRINCIPLE.md'), text);
};

const GOOD = (name: string): string =>
  `---\nname: ${name}\ndescription: Apply when ${name}.\n---\n\n# T\n\nBody.\n`;

Vitest.describe('PrincipleStore', () => {
  Vitest.it.effect('a missing store reads as empty', () =>
    Effect.gen(function* () {
      const store = yield* PrincipleStore.PrincipleStore;
      const root = freshRoot();
      Vitest.expect(yield* store.readAllRaw(root)).toStrictEqual([]);
      Vitest.expect(yield* store.list(root)).toStrictEqual([]);
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('readAllRaw keeps undecodable and file-less directories; list drops them', () =>
    Effect.gen(function* () {
      const store = yield* PrincipleStore.PrincipleStore;
      const root = freshRoot();
      write(root, 'b-good', GOOD('b-good'));
      write(root, 'a-broken', '# no frontmatter\n');
      Fs.mkdirSync(NodePath.join(root, '.agents', '@montflow', 'principles', 'c-empty'));
      Fs.writeFileSync(NodePath.join(root, '.agents', '@montflow', 'principles', 'README.md'), 'x');
      const raws = yield* store.readAllRaw(root);
      Vitest.expect(raws.map((entry) => entry.name)).toStrictEqual([
        'a-broken',
        'b-good',
        'c-empty',
      ]);
      Vitest.expect(raws[2]?.raw).toBe('');
      const listed = yield* store.list(root);
      Vitest.expect(listed.map((principle) => principle.name)).toStrictEqual(['b-good']);
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('readRaw returns bytes and refuses unknown or invalid names', () =>
    Effect.gen(function* () {
      const store = yield* PrincipleStore.PrincipleStore;
      const root = freshRoot();
      write(root, 'demo', GOOD('demo'));
      Vitest.expect(yield* store.readRaw(root, 'demo')).toBe(GOOD('demo'));
      const unknown = yield* store.readRaw(root, 'nope').pipe(Effect.flip);
      Vitest.expect(unknown.message).toBe("Unknown principle 'nope'.");
      const invalid = yield* store.readRaw(root, '../escape').pipe(Effect.flip);
      Vitest.expect(invalid.message).toBe("Unknown principle '../escape'.");
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
});
