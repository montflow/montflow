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

const SHIPPED = ['.agents', '@montflow', 'principles'];
const EXTENSIONS = ['.agents', '@montflow', 'mf-mode', 'extensions', 'principles'];

const freshRoot = (): string =>
  Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-principles-store-'));

const write = (root: string, store: ReadonlyArray<string>, name: string, text: string): void => {
  const dir = NodePath.join(root, ...store, name);
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
      Vitest.expect(yield* store.readExtensionsRaw(root)).toStrictEqual([]);
      Vitest.expect(yield* store.resolve(root)).toStrictEqual({ entries: [], issues: [] });
      Fs.rmSync(root, { recursive: true, force: true });
    }).pipe(Effect.provide(TestLive)),
  );

  Vitest.it.effect('readAllRaw keeps undecodable and file-less directories', () =>
    Effect.gen(function* () {
      const store = yield* PrincipleStore.PrincipleStore;
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
        const store = yield* PrincipleStore.PrincipleStore;
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
