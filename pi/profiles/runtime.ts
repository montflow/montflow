import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';

/** Runs a FileSystem/Path effect with the Node services layer. */
export const runStore = <A, E>(effect: Effect.Effect<A, E, FileSystem | Path>): Promise<A> =>
  Effect.runPromise(effect.pipe(Effect.provide(NodeServices.layer)));
