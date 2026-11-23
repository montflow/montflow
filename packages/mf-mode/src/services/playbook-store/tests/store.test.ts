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

const SHIPPED = ['.agents', '@montflow', 'playbooks'];
const EXTENSIONS = ['.agents', '@montflow', 'mf-mode', 'extensions', 'playbooks'];

const freshRoot = (): string =>
  Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-playbooks-store-'));

const write = (root: string, store: ReadonlyArray<string>, name: string, text: string): void => {
  const dir = NodePath.join(root, ...store, name);
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
      Vitest.expect(yield* store.readExtensionsRaw(root)).toStrictEqual([]);
      Vitest.expect(yield* store.resolve(root)).toStrictEqual({ entries: [], issues: [] });
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('readAllRaw keeps undecodable and file-less directories', () =>
    Effect.gen(function* () {
      const store = yield* PlaybookStore.PlaybookStore;
      const root = freshRoot();
      write(root, SHIPPED, 'b-good', GOOD('b-good'));
      write(root, SHIPPED, 'a-broken', '# no frontmatter\n');
      Fs.mkdirSync(NodePath.join(root, ...SHIPPED, 'c-empty'));
      Fs.writeFileSync(NodePath.join(root, ...SHIPPED, 'README.md'), 'x');
      const raws = yield* store.readAllRaw(root);
      Vitest.expect(raws.map((entry) => entry.name)).toStrictEqual([
        'a-broken',
        'b-good',
        'c-empty',
      ]);
      Vitest.expect(raws[2]?.raw).toBe('');
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect(
    'reads the extension store the same way and resolves it over the shipped one',
    () =>
      Effect.gen(function* () {
        const store = yield* PlaybookStore.PlaybookStore;
        const root = freshRoot();
        write(root, SHIPPED, 'demo', GOOD('demo'));
        write(root, SHIPPED, 'kept', GOOD('kept'));
        write(root, EXTENSIONS, 'demo', 'mine\n');
        write(root, EXTENSIONS, 'extra', GOOD('extra'));
        const extensions = yield* store.readExtensionsRaw(root);
        Vitest.expect(extensions).toStrictEqual([
          { name: 'demo', raw: 'mine\n' },
          { name: 'extra', raw: GOOD('extra') },
        ]);
        const { entries } = yield* store.resolve(root);
        Vitest.expect(entries).toStrictEqual([
          { name: 'demo', source: { kind: 'extension', mode: 'replaces' }, text: 'mine\n' },
          { name: 'extra', source: { kind: 'extension', mode: 'adds' }, text: GOOD('extra') },
          { name: 'kept', source: { kind: 'shipped' }, text: GOOD('kept') },
        ]);
        Fs.rmSync(root, { recursive: true, force: true });
      }).pipe(Effect.provide(TestLive)),
  );
});

Vitest.describe('PlaybookStore.references', () => {
  Vitest.it.effect('reads entry names from every store under the same root', () =>
    Effect.gen(function* () {
      const store = yield* PlaybookStore.PlaybookStore;
      const root = freshRoot();
      write(root, SHIPPED, 'demo', GOOD('demo'));
      write(root, EXTENSIONS, 'local-flow', GOOD('local-flow'));
      const entry = (parts: ReadonlyArray<string>, file: string): void => {
        Fs.mkdirSync(NodePath.join(root, ...parts), { recursive: true });
        Fs.writeFileSync(NodePath.join(root, ...parts, file), 'x');
      };
      entry(['.agents', 'skills', 'mf-mode-why'], 'SKILL.md');
      entry(['.agents', '@montflow', 'principles', 'fix-root-causes'], 'PRINCIPLE.md');
      entry(
        ['.agents', '@montflow', 'mf-mode', 'extensions', 'principles', 'local-rule'],
        'PRINCIPLE.md',
      );
      // A directory without its entry file does not count.
      Fs.mkdirSync(NodePath.join(root, '.agents', 'skills', 'empty'), { recursive: true });
      const references = yield* store.references(root);
      Vitest.expect(references.root).toBe(root);
      Vitest.expect([...(references.skills ?? [])]).toStrictEqual(['mf-mode-why']);
      Vitest.expect([...(references.principles ?? [])].toSorted()).toStrictEqual([
        'fix-root-causes',
        'local-rule',
      ]);
      Vitest.expect([...(references.playbooks ?? [])].toSorted()).toStrictEqual([
        'demo',
        'local-flow',
      ]);
      const bare = yield* store.references(freshRoot());
      Vitest.expect(bare.skills?.size).toBe(0);
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );
});
