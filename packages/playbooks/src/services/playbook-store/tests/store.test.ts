import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { Effect, Layer } from 'effect';
import { PlaybookStore } from '../index.js';

const TestLive = Layer.provide(
  PlaybookStore.Default,
  Layer.mergeAll(NodeFileSystem.layer, PlatformPath.layer),
);

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-playbooks-store-'));

const write = (root: string, name: string, text: string): void => {
  const dir = NodePath.join(root, '.agents', '@montflow', 'playbooks', name);
  Fs.mkdirSync(dir, { recursive: true });
  Fs.writeFileSync(NodePath.join(dir, 'PLAYBOOK.md'), text);
};

const GOOD = (name: string): string =>
  `---\nname: ${name}\ndescription: Run ${name}.\n---\n\n# T\n\nBody.\n`;

Vitest.describe('PlaybookStore', () => {
  Vitest.it.effect('a missing store reads as empty', () =>
    Effect.gen(function* () {
      const store = yield* PlaybookStore.PlaybookStore;
      const root = freshRoot();
      Vitest.expect(yield* store.readAllRaw(root)).toStrictEqual([]);
      Vitest.expect(yield* store.list(root)).toStrictEqual([]);
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('readAllRaw keeps undecodable and file-less directories; list drops them', () =>
    Effect.gen(function* () {
      const store = yield* PlaybookStore.PlaybookStore;
      const root = freshRoot();
      write(root, 'b-good', GOOD('b-good'));
      write(root, 'a-broken', '# no frontmatter\n');
      Fs.mkdirSync(NodePath.join(root, '.agents', '@montflow', 'playbooks', 'c-empty'));
      Fs.writeFileSync(NodePath.join(root, '.agents', '@montflow', 'playbooks', 'README.md'), 'x');
      const raws = yield* store.readAllRaw(root);
      Vitest.expect(raws.map((entry) => entry.name)).toStrictEqual([
        'a-broken',
        'b-good',
        'c-empty',
      ]);
      Vitest.expect(raws[2]?.raw).toBe('');
      const listed = yield* store.list(root);
      Vitest.expect(listed.map((playbook) => playbook.name)).toStrictEqual(['b-good']);
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('readRaw returns bytes and refuses unknown or invalid names', () =>
    Effect.gen(function* () {
      const store = yield* PlaybookStore.PlaybookStore;
      const root = freshRoot();
      write(root, 'demo', GOOD('demo'));
      Vitest.expect(yield* store.readRaw(root, 'demo')).toBe(GOOD('demo'));
      const unknown = yield* store.readRaw(root, 'nope').pipe(Effect.flip);
      Vitest.expect(unknown.message).toBe("Unknown playbook 'nope'.");
      const invalid = yield* store.readRaw(root, '../escape').pipe(Effect.flip);
      Vitest.expect(invalid.message).toBe("Unknown playbook '../escape'.");
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
});

Vitest.describe('PlaybookStore.references', () => {
  Vitest.it.effect('reads entry names from the three stores under the same root', () =>
    Effect.gen(function* () {
      const store = yield* PlaybookStore.PlaybookStore;
      const root = freshRoot();
      write(root, 'demo', GOOD('demo'));
      const entry = (parts: ReadonlyArray<string>, file: string): void => {
        Fs.mkdirSync(NodePath.join(root, ...parts), { recursive: true });
        Fs.writeFileSync(NodePath.join(root, ...parts, file), 'x');
      };
      entry(['.agents', 'skills', 'mf-mode-why'], 'SKILL.md');
      entry(['.agents', '@montflow', 'principles', 'fix-root-causes'], 'PRINCIPLE.md');
      // A directory without its entry file does not count.
      Fs.mkdirSync(NodePath.join(root, '.agents', 'skills', 'empty'), { recursive: true });
      const references = yield* store.references(root);
      Vitest.expect(references.root).toBe(root);
      Vitest.expect([...(references.skills ?? [])]).toStrictEqual(['mf-mode-why']);
      Vitest.expect([...(references.principles ?? [])]).toStrictEqual(['fix-root-causes']);
      Vitest.expect([...(references.playbooks ?? [])]).toStrictEqual(['demo']);
      const bare = yield* store.references(freshRoot());
      Vitest.expect(bare.skills?.size).toBe(0);
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
});
