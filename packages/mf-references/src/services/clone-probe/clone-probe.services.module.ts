import { Context, Effect, FileSystem, Layer, Option } from 'effect';
import { clonePath, normalizeOriginUrl } from '../../modules/reference/index.js';
import type { Reference } from '../../modules/reference/index.js';
import type { CloneObservation, CloneState } from '../../modules/git/git.module.js';
import { GitPort } from '../../modules/git/git.module.js';

/**
 * Read-only observation of one reference clone. Every git call goes through
 * {@link GitPort}; nothing is cloned, fetched, checked out, or cleaned.
 */

/** Base observation for a path that is absent or not a git work tree. */
const unavailable = (
  path: string,
  present: boolean,
  isDirectory: boolean,
  reference: Reference,
): CloneObservation => ({
  path,
  state: present ? 'present' : 'missing',
  present,
  isDirectory,
  gitWorkTree: false,
  dirtyPaths: 0,
  matchesOrigin: false,
  matchesRef: reference.ref === undefined || reference.ref === '',
});

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const git = yield* GitPort;

  /** Observe one clone without writing. */
  const probe = Effect.fn('CloneProbe.probe')(function* (root: string, reference: Reference) {
    const clone = clonePath(root, reference.name);
    const link = yield* fs.readLink(clone).pipe(Effect.option);
    if (Option.isSome(link)) return unavailable(clone, true, false, reference);
    const info = yield* fs.stat(clone).pipe(Effect.orElseSucceed(() => undefined));
    if (info === undefined) return unavailable(clone, false, false, reference);
    if (info.type !== 'Directory') return unavailable(clone, true, false, reference);

    const repo = yield* git.isRepo(clone);
    if (!repo.workTree) return unavailable(clone, true, true, reference);

    const dirty = yield* git.isDirty(clone);
    const head = yield* git.head(clone);
    const currentRef = yield* git.currentBranch(clone);
    const origin = yield* git.origin(clone);
    const defaultBranch = yield* git.defaultBranch(clone);
    const actualKey = origin === undefined ? undefined : normalizeOriginUrl(origin);
    const expectedKey = normalizeOriginUrl(reference.url);
    const matchesOrigin =
      actualKey !== undefined && expectedKey !== undefined && actualKey === expectedKey;

    const recordedRef = reference.ref?.trim() ?? '';
    let refResolved: boolean | undefined;
    let resolvedRefHead: string | undefined;
    let matchesRef = true;
    if (recordedRef !== '') {
      const resolved = yield* git.resolveRef(clone, recordedRef);
      refResolved = resolved.resolved;
      resolvedRefHead = resolved.sha;
      matchesRef = resolved.resolved && head !== undefined && resolved.sha === head;
    }

    const state: CloneState =
      dirty.ok === false || dirty.count > 0
        ? 'dirty'
        : recordedRef !== '' && !matchesRef
          ? 'ref-mismatch'
          : 'present';

    return {
      path: clone,
      state,
      present: true,
      isDirectory: true,
      gitWorkTree: true,
      dirtyPaths: dirty.count,
      dirtyError: dirty.ok ? undefined : (dirty.error ?? 'git status did not complete'),
      head,
      currentRef,
      defaultBranch,
      origin,
      matchesOrigin,
      refResolved,
      resolvedRefHead,
      matchesRef,
    } satisfies CloneObservation;
  });

  return { probe } as const;
});

export const Id = '@montflow/CloneProbe';
export type Id = typeof Id;

export type Impl = Effect.Success<typeof make>;

/** Read-only clone-state probe over the derived clone path. */
export class CloneProbe extends Context.Service<CloneProbe, Impl>()(Id) {}

export const Default = Layer.effect(CloneProbe, make);
