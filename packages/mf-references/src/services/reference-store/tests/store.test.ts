import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { Reference, ReferenceStore, Verifier } from '../../../index.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.provide(ReferenceStore.Default, NodeLive);

/** A throwaway workspace root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-references-store-'));

/** The canonical valid entry used across the store tests. */
const ENTRY = Reference.Reference.make({
  name: 'effect',
  url: 'https://github.com/Effect-TS/effect-smol',
  purpose: 'Effect v4 source, published upstream as effect-smol.',
  added: '2026-07-22',
});
const BODY = '\n# Notes\n\nPinned for the runtime work.\n';

Vitest.describe('ReferenceStore', () => {
  Vitest.it.effect('writes, scans, reads, and removes one entry', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReferenceStore.ReferenceStore;

      yield* store.write(root, ENTRY, BODY);

      Vitest.expect(yield* store.exists(root, 'effect')).toBe(true);
      Vitest.expect(yield* store.list(root)).toStrictEqual(['effect']);
      Vitest.expect(yield* store.readRaw(root, 'effect')).toBe(
        Reference.encodeReferenceFile({ reference: ENTRY, body: BODY }),
      );
      Vitest.expect(yield* store.readOne(root, 'effect')).toEqual(ENTRY);

      const snapshot = yield* store.scan(root);
      Vitest.expect(snapshot.present).toBe(true);
      Vitest.expect(snapshot.entries).toHaveLength(1);
      Vitest.expect(snapshot.entries[0]?.extraFiles).toStrictEqual([]);
      Vitest.expect(Verifier.verifyStore(snapshot).valid).toBe(true);

      yield* store.remove(root, 'effect');
      Vitest.expect(yield* store.exists(root, 'effect')).toBe(false);
      const missing = yield* store.readRaw(root, 'effect').pipe(Effect.flip);
      Vitest.expect(missing.reason).toBe("No reference 'effect'.");

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reads a missing root as empty, not as a failure', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReferenceStore.ReferenceStore;

      Vitest.expect(yield* store.list(root)).toStrictEqual([]);
      const snapshot = yield* store.scan(root);
      Vitest.expect(snapshot).toStrictEqual({ present: false, entries: [] });
      Vitest.expect(Verifier.verifyStore(snapshot).valid).toBe(false);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('preserves body notes across write and read', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReferenceStore.ReferenceStore;
      const body = '\n# Notes\n\nTag `v2.0.18` upstream.\n\n## History\n\nFirst registered here.\n';

      yield* store.write(root, ENTRY, body);
      const raw = yield* store.readRaw(root, 'effect');
      Vitest.expect(raw).toContain(body);

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reports an invalid entry instead of decoding it', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReferenceStore.ReferenceStore;
      const dir = join(root, Reference.STORE_DIR, 'effect');
      yield* Effect.promise(() => mkdir(dir, { recursive: true }));
      yield* Effect.promise(() =>
        writeFile(join(dir, Reference.ENTRY_FILE), '---\nname: Effect\n---\n'),
      );

      const failure = yield* store.readOne(root, 'effect').pipe(Effect.flip);
      Vitest.expect(failure.reason).toContain('not a valid REFERENCE.md');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('surfaces unexpected files beside REFERENCE.md', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReferenceStore.ReferenceStore;
      yield* store.write(root, ENTRY, BODY);
      const dir = join(root, Reference.STORE_DIR, 'effect');
      yield* Effect.promise(() => writeFile(join(dir, 'NOTES.md'), 'stray\n'));

      const snapshot = yield* store.scan(root);
      Vitest.expect(snapshot.entries[0]?.extraFiles).toStrictEqual(['NOTES.md']);
      const verified = Verifier.verifyStore(snapshot);
      Vitest.expect(verified.valid).toBe(true);
      Vitest.expect(verified.entries[0]?.issues[0]?.severity).toBe('warning');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});

Vitest.describe('ReferenceStore path safety', () => {
  Vitest.it.effect('rejects traversal, nested, and absolute names in every entry operation', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const store = yield* ReferenceStore.ReferenceStore;
      const outside = join(root, 'secret');
      yield* Effect.promise(() => mkdir(outside, { recursive: true }));
      yield* Effect.promise(() => writeFile(join(outside, Reference.ENTRY_FILE), 'name: secret\n'));

      for (const name of ['../secret', 'nested/name', outside, '.', '..']) {
        const read = yield* store.readRaw(root, name).pipe(Effect.flip);
        Vitest.expect(read.reason).toBe(`Invalid reference name '${name}'.`);
        const removed = yield* store.remove(root, name).pipe(Effect.flip);
        Vitest.expect(removed.reason).toBe(`Invalid reference name '${name}'.`);
        const exists = yield* store.exists(root, name).pipe(Effect.flip);
        Vitest.expect(exists.reason).toBe(`Invalid reference name '${name}'.`);
      }
      Vitest.expect(
        yield* Effect.promise(() => readFile(join(outside, Reference.ENTRY_FILE), 'utf8')),
      ).toBe('name: secret\n');

      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect(
    'skips a symlinked entry directory in scan and refuses to read or remove it',
    () =>
      Effect.gen(function* () {
        const root = yield* Effect.promise(freshRoot);
        const store = yield* ReferenceStore.ReferenceStore;
        const outside = join(root, 'outside');
        const storeDir = join(root, Reference.STORE_DIR);
        yield* Effect.promise(() => mkdir(outside, { recursive: true }));
        yield* Effect.promise(() => mkdir(storeDir, { recursive: true }));
        yield* Effect.promise(() =>
          writeFile(
            join(outside, Reference.ENTRY_FILE),
            Reference.encodeReferenceFile({
              reference: Reference.Reference.make({
                name: 'linked',
                url: 'https://example.test/owner/linked.git',
                purpose: 'Out-of-store fixture.',
                added: '2026-10-26',
              }),
              body: '\n# Notes\n',
            }),
          ),
        );
        yield* Effect.promise(() => symlink(outside, join(storeDir, 'linked'), 'dir'));

        const snapshot = yield* store.scan(root);
        Vitest.expect(snapshot.entries).toStrictEqual([]);
        Vitest.expect(yield* store.list(root)).toStrictEqual([]);

        const read = yield* store.readRaw(root, 'linked').pipe(Effect.flip);
        Vitest.expect(read.reason).toContain('is a symlink');
        const exists = yield* store.exists(root, 'linked').pipe(Effect.flip);
        Vitest.expect(exists.reason).toContain('is a symlink');
        const removed = yield* store.remove(root, 'linked').pipe(Effect.flip);
        Vitest.expect(removed.reason).toContain('is a symlink');
        Vitest.expect(
          yield* Effect.promise(() => readFile(join(outside, Reference.ENTRY_FILE), 'utf8')),
        ).toContain('name: linked');

        yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
      }).pipe(Effect.provide(Live)),
  );
});
