import * as Fs from 'node:fs';
import * as NodeOsPath from 'node:path';
import * as Os from 'node:os';
import { Effect, Layer } from 'effect';
import type { FileSystem, Path } from 'effect';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Store } from '../index.js';

export const StoreTag = Store.Store;
export const StoreErrorClass = Store.StoreError;

const Live: Layer.Layer<FileSystem.FileSystem | Path.Path> = Layer.mergeAll(
  NodeFileSystem.layer,
  NodePath.layer,
);

/** Unique scratch root per test (OS-guaranteed) — no shared state across files. */
export const freshRoot = (): string =>
  Fs.mkdtempSync(NodeOsPath.join(Os.tmpdir(), 'pi-runs-store-test-'));

/** Provide the ephemeral Store (no services needed, no disk touched). */
export const provideEphemeral = <A, E>(
  self: Effect.Effect<A, E, Store.Store>,
): Effect.Effect<A, E> => self.pipe(Effect.provide(Store.Ephemeral));

/** Provide a root-scoped Store plus live filesystem layers. */
export const provideStore = <A, E>(
  root: string,
  self: Effect.Effect<A, E, Store.Store>,
): Effect.Effect<A, E> => {
  const storeLayer: Layer.Layer<Store.Store, never, FileSystem.FileSystem | Path.Path> =
    Layer.effect(Store.Store, Store.makeWithRoot(root));
  return self.pipe(Effect.provide(storeLayer), Effect.provide(Live));
};
