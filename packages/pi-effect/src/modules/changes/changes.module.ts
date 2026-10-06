import { Effect, FileSystem, Match, Stream } from 'effect';

/**
 * The shared change-notification contract for montflow extension stores.
 *
 * Every extension store (runs, profiles, prompts, skills, features) writes to
 * a repo-local directory. A store that can report its own changes implements
 * {@link Watchable}; a consumer (the workspace) subscribes through that
 * interface and patches its query cache — it never watches the filesystem
 * itself. Keeping the contract here makes every extension behave identically.
 */

/** What happened to one entity in a store. */
export type ChangeKind = 'created' | 'updated' | 'removed';

/**
 * One observed store change. `value` carries the new entity (created/updated)
 * when it is cheap to re-read, so a consumer can patch local state without a
 * refetch; `removed` never carries one.
 */
export interface Change<A> {
  readonly kind: ChangeKind;
  readonly id: string;
  readonly value?: A | undefined;
}

/**
 * A store that reports changes as they happen. `watch` starts an unbounded
 * stream for a repo root; the consumer owns its lifetime (scope it, don't
 * collect it).
 */
export interface Watchable<A> {
  readonly watch: (root: string) => Stream.Stream<Change<A>, never>;
}

/**
 * Map a raw filesystem watch event tag to a change kind.
 * @param event - filesystem watch event
 * @returns the matching store change kind
 */
export const kindOf = (event: FileSystem.WatchEvent): ChangeKind =>
  Match.value(event).pipe(
    Match.tag('Create', () => 'created' as const),
    Match.tag('Update', () => 'updated' as const),
    Match.tag('Remove', () => 'removed' as const),
    Match.exhaustive,
  );

/**
 * Map a burst of raw filesystem events into store changes. `resolve` reads one
 * event into zero or more changes (usually by re-reading the entity); the
 * result is debounced so a multi-write save collapses to its latest change.
 * @param events - raw filesystem watch events
 * @param resolve - event-to-changes mapper
 * @param debounceMillis - coalescing window; `0` disables debouncing
 * @returns the coalesced change stream
 */
export const changesFrom = <A, R>(
  events: Stream.Stream<FileSystem.WatchEvent, never, R>,
  resolve: (event: FileSystem.WatchEvent) => Effect.Effect<ReadonlyArray<Change<A>>, never, R>,
  debounceMillis = 100,
): Stream.Stream<Change<A>, never, R> => {
  const mapped = events.pipe(Stream.mapEffect(resolve), Stream.flattenIterable);
  return debounceMillis > 0 ? mapped.pipe(Stream.debounce(debounceMillis)) : mapped;
};

/** Tuning for {@link watchChanges}. */
export interface WatchChangesOptions<A, R> {
  /** Directory to watch. A missing directory yields an empty stream. */
  readonly directory: string;
  /** Map one filesystem event to the changes it represents. */
  readonly resolve: (
    event: FileSystem.WatchEvent,
  ) => Effect.Effect<ReadonlyArray<Change<A>>, never, R>;
  /** Watch subdirectories too. Defaults to `true`. */
  readonly recursive?: boolean | undefined;
  /** Coalescing window for bursts of writes, in millis. Defaults to `100`. */
  readonly debounceMillis?: number | undefined;
}

/**
 * Build a store change stream from a directory watch. The directory is
 * checked first, so a not-yet-installed store yields an empty stream instead
 * of a failing watch; callers re-subscribe once the store exists.
 * @param options - directory, event resolver, and watch tuning
 * @returns the change stream, never failing
 */
export const watchChanges = <A, R>(
  options: WatchChangesOptions<A, R>,
): Stream.Stream<Change<A>, never, FileSystem.FileSystem | R> =>
  Stream.unwrap(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const exists = yield* fs.exists(options.directory).pipe(Effect.orElseSucceed(() => false));
      if (!exists) return Stream.empty;
      return changesFrom(
        fs.watch(options.directory, { recursive: options.recursive ?? true }).pipe(Stream.ignore),
        options.resolve,
        options.debounceMillis,
      );
    }),
  );
