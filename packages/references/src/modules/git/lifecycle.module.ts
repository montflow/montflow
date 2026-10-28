import { Clock, Context, Effect, FileSystem, Layer, Option, Path } from 'effect';
import type { PlatformError } from 'effect/PlatformError';
import * as Reference from '../reference/index.js';
import { COMMIT_PATTERN } from '../reference/index.js';
import type { Reference as ReferenceEntry } from '../reference/index.js';
import { CloneProbe } from '../../services/clone-probe/clone-probe.services.module.js';
import { ReferenceStore } from '../../services/reference-store/reference-store.services.module.js';
import type { StoreError } from '../../services/reference-store/reference-store.services.module.js';
import {
  GitPort,
  branchName,
  compareUnpinned,
  isTagCandidate,
  resolveRemoteRef,
  tagName,
} from './git.module.js';
import type { RefResolution } from './git.module.js';

/**
 * The git lifecycle operations behind `add`, `update`, `sync`, and `status`.
 *
 * These are store/git operations, not CLI engines: no flag parsing, no
 * renderer, no process exit. Every result is structured and carries the exact
 * agent-default line C004 renders. All git work goes through {@link GitPort}.
 */

/** Default invocation named by actionable messages. */
export const DEFAULT_INVOCATION = '/mf-references';

/** One lifecycle refusal or failure, with the exact line to print. */
export interface LifecycleFailure {
  readonly kind: 'refused' | 'failed';
  readonly code: string;
  readonly slug?: string | undefined;
  readonly message: string;
}

/** Accepted input for {@link GitLifecycleImpl.add}. */
export interface AddInput {
  readonly url: string;
  readonly name?: string | undefined;
  readonly purpose?: string | undefined;
  readonly ref?: string | undefined;
  readonly invocation?: string | undefined;
}

/** Result of a successful `add` that created one entry and clone. */
export interface AddCreated {
  readonly kind: 'created';
  readonly slug: string;
  readonly url: string;
  readonly ref?: string | undefined;
  /** Observed `HEAD` after the clone (and checkout, when pinned). */
  readonly head?: string | undefined;
  readonly message: string;
}

/** Result of an `add` for an already-registered URL. */
export interface AddRouted {
  readonly kind: 'routed';
  readonly slug: string;
  readonly url: string;
  readonly notice: string;
  readonly update: UpdateResult;
  readonly message: string;
}

/** Everything `add` can return. */
export type AddResult = AddCreated | AddRouted | LifecycleFailure;

/** A missing entry materialized from the registry. */
export interface UpdateCreated {
  readonly kind: 'created';
  readonly slug: string;
  readonly url: string;
  readonly ref?: string | undefined;
  /** Observed `HEAD` after materialization. */
  readonly head?: string | undefined;
  /** Configured `origin`, printed by `--verbose`. */
  readonly origin?: string | undefined;
  /** Upstream branch or recorded ref, printed by `--verbose`. */
  readonly upstream?: string | undefined;
  readonly message: string;
}

/** An entry that was already in its recorded state. */
export interface UpdatePresent {
  readonly kind: 'present';
  readonly slug: string;
  /** Configured `origin`, printed by `--verbose`. */
  readonly origin?: string | undefined;
  /** Upstream branch or recorded ref, printed by `--verbose`. */
  readonly upstream?: string | undefined;
  readonly message: string;
}

/** An entry whose clone moved. */
export interface UpdateUpdated {
  readonly kind: 'updated';
  readonly slug: string;
  readonly head?: string | undefined;
  readonly branch?: string | undefined;
  /** Configured `origin`, printed by `--verbose`. */
  readonly origin?: string | undefined;
  /** Upstream branch or recorded ref, printed by `--verbose`. */
  readonly upstream?: string | undefined;
  readonly message: string;
}

/** Everything `update` can return. */
export type UpdateResult = UpdateCreated | UpdatePresent | UpdateUpdated | LifecycleFailure;

/** Options for {@link GitLifecycleImpl.update}. */
export interface UpdateOptions {
  readonly force?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/** One entry's `sync` outcome. */
export interface SyncEntry {
  readonly kind: 'created' | 'updated' | 'ok' | 'skipped' | 'failed';
  readonly slug: string;
  /** Observed `HEAD` after the step, printed by `--verbose`. */
  readonly head?: string | undefined;
  readonly message: string;
}

/** A whole `sync` run; `failed` is true when any entry did not end present. */
export interface SyncReport {
  readonly entries: ReadonlyArray<SyncEntry>;
  readonly failed: boolean;
}

/** Options for {@link GitLifecycleImpl.sync}. */
export interface SyncOptions {
  readonly name?: string | undefined;
  readonly all?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/** Everything `sync` can return. */
export type SyncResult = SyncReport | LifecycleFailure;

/** One `status` row. */
export interface StatusRow {
  readonly slug: string;
  readonly state: 'missing' | 'present' | 'dirty' | 'ref-mismatch' | 'foreign' | 'invalid';
  readonly message: string;
  readonly refused: boolean;
  readonly behind?: number | undefined;
  readonly ahead?: number | undefined;
  readonly failure?: LifecycleFailure | undefined;
  /** Workspace-relative clone path, printed by `--verbose`. */
  readonly path?: string | undefined;
  /** Configured `origin`, printed by `--verbose`. */
  readonly origin?: string | undefined;
  /** Observed `HEAD`, printed by `--verbose`. */
  readonly head?: string | undefined;
  /** Upstream branch, printed by `--verbose`. */
  readonly upstream?: string | undefined;
}

/** Whole `status` report, summary line last. */
export interface StatusReport {
  readonly rows: ReadonlyArray<StatusRow>;
  readonly summary: string;
  readonly refused: boolean;
}

/** Options for {@link GitLifecycleImpl.status}. */
export interface StatusOptions {
  readonly name?: string | undefined;
  readonly fetch?: boolean | undefined;
  readonly invocation?: string | undefined;
}

/** Everything `status` can return. */
export type StatusResult = StatusReport | LifecycleFailure;

/** Unexpected filesystem or store failures; refusals are results, not errors. */
export type LifecycleError = PlatformError | StoreError;

/** The lifecycle surface C004's engines call. */
export interface GitLifecycleImpl {
  readonly add: (root: string, input: AddInput) => Effect.Effect<AddResult, LifecycleError>;
  readonly update: (
    root: string,
    target: string,
    options?: UpdateOptions,
  ) => Effect.Effect<UpdateResult, LifecycleError>;
  readonly sync: (root: string, options?: SyncOptions) => Effect.Effect<SyncResult, LifecycleError>;
  readonly status: (
    root: string,
    options?: StatusOptions,
  ) => Effect.Effect<StatusResult, LifecycleError>;
}

/** The one ignore-rule predicate `add` and `doctor` share. */
export const hasIgnoreRule = (content: string): boolean =>
  content.split(/\r?\n/).some((line) => {
    const normalized = line.trim().replace(/^\//, '').replace(/\/$/, '');
    return normalized === Reference.CLONE_DIR;
  });

/** Append the ignore rule when no equivalent line exists. */
export const appendIgnoreRule = (content: string): string => {
  if (hasIgnoreRule(content)) return content;
  if (content === '') return `${Reference.CLONE_DIR}\n`;
  if (content.endsWith('\n')) return `${content}${Reference.CLONE_DIR}\n`;
  return `${content}\n${Reference.CLONE_DIR}\n`;
};

/** First seven characters of a commit id, or `(none)`. */
const sha7 = (sha: string | undefined): string =>
  sha === undefined || sha === '' ? '(none)' : sha.slice(0, 7);

const failure = (kind: 'refused' | 'failed', code: string, message: string): LifecycleFailure => ({
  kind,
  code,
  message,
});

/** One stored entry that cannot be decoded into a usable reference. */
export interface InvalidEntry {
  readonly slug: string;
  readonly reason: string;
  /** The entry's own url, when it decoded but failed another rule. */
  readonly url?: string | undefined;
}

/** The one refusal for a missing store root, shared by every verb. */
const storeMissingFailure = (invocation: string): LifecycleFailure =>
  failure(
    'refused',
    'store-missing',
    `refused: Store root ${Reference.STORE_DIR}/ is missing; run '${invocation} doctor'.`,
  );

/** One unusable entry, named with its decode reason. */
const invalidEntryFailure = (
  kind: 'refused' | 'failed',
  entry: InvalidEntry,
  invocation: string,
): LifecycleFailure =>
  failureWithSlug(
    kind,
    'invalid-entry',
    entry.slug,
    `${kind}: ${entry.slug} entry is unusable (${entry.reason}); run '${invocation} verify ${entry.slug}'`,
  );

const failureWithSlug = (
  kind: 'refused' | 'failed',
  code: string,
  slug: string,
  message: string,
): LifecycleFailure => ({ kind, code, slug, message });

const invocationOf = (value: string | undefined): string => value ?? DEFAULT_INVOCATION;

const relativeClone = (slug: string): string => `${Reference.CLONE_DIR}/${slug}`;

/** Ref names tried only to materialize a ref the clone did not fetch. */
const repairRefspecs = (ref: string): ReadonlyArray<string> => {
  const specs: Array<string> = [];
  if (isTagCandidate(ref)) {
    const name = tagName(ref);
    specs.push(`refs/tags/${name}:refs/tags/${name}`);
  }
  if (COMMIT_PATTERN.test(ref)) {
    specs.push(ref);
  } else if (!ref.startsWith('refs/tags/')) {
    const branch = branchName(ref);
    specs.push(`refs/heads/${branch}:refs/remotes/origin/${branch}`);
  }
  return specs;
};

/** Slug validation for an explicit `--name`. */
const invalidNameMessage = (name: string): string =>
  `refused: invalid name '${name}': must match ^[a-z0-9]+(-[a-z0-9]+)*$`;

/** Purpose validation mirroring B001's verifier rules. */
const purposeReason = (purpose: string): string | undefined => {
  if (purpose.trim() === '') return 'must not be empty';
  if (purpose.includes('\n') || purpose.includes('\r')) return 'must be one line';
  if (purpose.length > 280) return 'must be 1-280 chars';
  if (purpose.includes('#') || purpose.includes(': ')) return "must not contain '#' or ': '";
  if (!purpose.endsWith('.')) return "must end with '.'";
  return undefined;
};

const entryExistsMessage = (slug: string, invocation: string): string =>
  `refused: ${relativeClone(slug)} already exists but no entry is registered for ${slug}; remove it or run '${invocation} status'`;

const collisionMessage = (slug: string, registeredUrl: string, url: string): string =>
  `refused: slug '${slug}' is already registered for ${registeredUrl}; pass --name <other-slug> to register ${url} under a different name`;

const ownershipMessage = (
  slug: string,
  reference: ReferenceEntry,
  actual: string | undefined,
  invocation: string,
): string =>
  `refused: ${slug} at ${relativeClone(slug)} has origin ${actual ?? '(none)'}, expected ${reference.url}; remove the directory and run '${invocation} sync ${slug}'`;

const dirtyMessage = (slug: string, count: number, invocation: string): string =>
  `refused: ${slug} is dirty (${count} changed paths); run '${invocation} update ${slug} --force' to discard local changes`;

const aheadMessage = (slug: string, branch: string, ahead: number, behind: number): string =>
  `refused: ${slug} cannot fast-forward origin/${branch} (ahead ${ahead}, behind ${behind}); pass --force to reset`;

const uniqueCommitsMessage = (branch: string, count: number, target: string): string =>
  `refused: local branch '${branch}' has ${count} commits not on origin/${target}; pass --force to discard`;

const unresolvableMessage = (slug: string, ref: string, url: string): string =>
  `refused: ${slug} ref '${ref}' does not resolve in ${url}; update the pin in ${Reference.STORE_DIR}/${slug}/${Reference.ENTRY_FILE}`;

const checkoutFailure = (
  slug: string,
  ref: string,
  message: string,
  head: string | undefined,
): string => `failed: checkout ${slug} @ ${ref}: ${message} (HEAD ${sha7(head)})`;

const statusFailure = (slug: string, message: string): string =>
  `failed ${slug} status: ${message}`;

const forceFailure = (
  slug: string,
  stage: 'reset' | 'clean',
  message: string,
  head: string | undefined,
): string => `failed: ${slug} ${stage}: ${message} (HEAD ${sha7(head)})`;

const applyFailureMessage = (
  slug: string,
  ref: string,
  applied: {
    readonly message: string;
    readonly head: string | undefined;
    readonly stage: 'checkout' | 'reset' | 'clean';
  },
): string =>
  applied.stage === 'checkout'
    ? checkoutFailure(slug, ref, applied.message, applied.head)
    : forceFailure(slug, applied.stage, applied.message, applied.head);

/** Ownership result for one path. */
type Ownership =
  | { readonly kind: 'missing' }
  | { readonly kind: 'foreign'; readonly actual: string | undefined }
  | { readonly kind: 'ok' };

/** What resolving one `ref` produced, including the repair attempts. */
type TargetOutcome =
  | { readonly ok: true; readonly resolution: RefResolution }
  | { readonly ok: false; readonly message: string };

/** What applying one resolved target produced. */
type ApplyOutcome =
  | { readonly ok: true; readonly sha: string; readonly head: string }
  | {
      readonly ok: false;
      readonly stage: 'checkout' | 'reset' | 'clean';
      readonly message: string;
      readonly head: string | undefined;
    };

const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const git = yield* GitPort;
  const store = yield* ReferenceStore;
  const probe = yield* CloneProbe;

  /** Decode every entry in the store, splitting valid from unusable. */
  const loadReferences = Effect.fn('GitLifecycle.loadReferences')(function* (root: string) {
    const snapshot = yield* store.scan(root);
    const entries: Array<ReferenceEntry> = [];
    const invalid: Array<InvalidEntry> = [];
    for (const entry of snapshot.entries) {
      if (entry.raw === undefined) {
        invalid.push({ slug: entry.slug, reason: `${Reference.ENTRY_FILE} is missing` });
        continue;
      }
      const decoded = Reference.decodeReferenceFileDetailed(entry.raw);
      if (decoded.kind === 'valid' && decoded.document.reference.name !== entry.slug) {
        invalid.push({
          slug: entry.slug,
          reason: `name: '${decoded.document.reference.name}' does not match directory '${entry.slug}'`,
          url: decoded.document.reference.url,
        });
      } else if (decoded.kind === 'valid') {
        entries.push(decoded.document.reference);
      } else {
        invalid.push(
          decoded.url === undefined
            ? { slug: entry.slug, reason: decoded.reason }
            : { slug: entry.slug, reason: decoded.reason, url: decoded.url },
        );
      }
    }
    return {
      present: snapshot.present,
      entries: entries.toSorted((left, right) => left.name.localeCompare(right.name)),
      invalid: invalid.toSorted((left, right) => left.slug.localeCompare(right.slug)),
    };
  });

  /** Check ownership of one concrete clone path. */
  const checkOwnershipAt = Effect.fn('GitLifecycle.checkOwnershipAt')(function* (
    clone: string,
    reference: ReferenceEntry,
  ) {
    const link = yield* fs.readLink(clone).pipe(Effect.option);
    if (Option.isSome(link)) return { kind: 'foreign', actual: '(symlink)' } satisfies Ownership;
    const info = yield* fs.stat(clone).pipe(Effect.orElseSucceed(() => undefined));
    if (info === undefined) return { kind: 'missing' } satisfies Ownership;
    if (info.type !== 'Directory') {
      return { kind: 'foreign', actual: '(not a directory)' } satisfies Ownership;
    }
    const repo = yield* git.isRepo(clone);
    if (!repo.available) {
      return { kind: 'foreign', actual: '(git is not installed)' } satisfies Ownership;
    }
    if (!repo.workTree) {
      return { kind: 'foreign', actual: '(not a git work tree)' } satisfies Ownership;
    }
    const origin = yield* git.origin(clone);
    const actualKey = origin === undefined ? undefined : Reference.normalizeOriginUrl(origin);
    const expectedKey = Reference.normalizeOriginUrl(reference.url);
    if (actualKey === undefined || expectedKey === undefined || actualKey !== expectedKey) {
      return { kind: 'foreign', actual: origin ?? '(none)' } satisfies Ownership;
    }
    return { kind: 'ok' } satisfies Ownership;
  });

  /** Resolve a ref, repairing a missing ref with one explicit refspec fetch. */
  const resolveTarget = Effect.fn('GitLifecycle.resolveTarget')(function* (
    clone: string,
    ref: string,
    allowFetch: boolean,
  ) {
    let resolution = yield* git.resolveRef(clone, ref);
    if (!resolution.resolved && allowFetch) {
      for (const refspec of repairRefspecs(ref)) {
        yield* git.fetchRef(clone, refspec);
      }
      resolution = yield* git.resolveRef(clone, ref);
    }
    if (!resolution.resolved) {
      return { ok: false, message: 'ref does not resolve' } satisfies TargetOutcome;
    }
    return { ok: true, resolution } satisfies TargetOutcome;
  });

  /** Move HEAD to one resolved target, honouring force semantics. */
  const applyTarget = Effect.fn('GitLifecycle.applyTarget')(function* (
    clone: string,
    resolution: RefResolution,
    force: boolean,
  ) {
    const before = yield* git.head(clone);
    if (!resolution.resolved || resolution.sha === undefined) {
      return {
        ok: false,
        stage: 'checkout',
        message: 'ref does not resolve',
        head: before,
      } satisfies ApplyOutcome;
    }
    const checkedOut = yield* git.checkoutDetached(clone, resolution.sha, force);
    if (!checkedOut.ok) {
      return {
        ok: false,
        stage: 'checkout',
        message: checkedOut.message,
        head: before,
      } satisfies ApplyOutcome;
    }
    if (force) {
      const reset = yield* git.resetHard(clone, resolution.sha);
      if (!reset.ok) {
        return {
          ok: false,
          stage: 'reset',
          message: reset.message,
          head: yield* git.head(clone),
        } satisfies ApplyOutcome;
      }
      const cleaned = yield* git.clean(clone);
      if (!cleaned.ok) {
        return {
          ok: false,
          stage: 'clean',
          message: cleaned.message,
          head: yield* git.head(clone),
        } satisfies ApplyOutcome;
      }
    }
    const after = yield* git.head(clone);
    if (after !== resolution.sha) {
      return {
        ok: false,
        stage: 'checkout',
        message: `HEAD is ${sha7(after)}, expected ${sha7(resolution.sha)}`,
        head: after,
      } satisfies ApplyOutcome;
    }
    return { ok: true, sha: resolution.sha, head: after } satisfies ApplyOutcome;
  });

  /** Create the clone root, `.gitkeep`, and ignore rule before cloning. */
  const scaffold = Effect.fn('GitLifecycle.scaffold')(function* (root: string) {
    const cloneRoot = path.join(root, Reference.CLONE_DIR);
    yield* fs.makeDirectory(cloneRoot, { recursive: true });
    const keep = path.join(cloneRoot, '.gitkeep');
    const present = yield* fs.exists(keep);
    if (!present) {
      yield* fs.writeFileString(keep, '');
      const staged = yield* git.addForce(root, [`${Reference.CLONE_DIR}/.gitkeep`]);
      if (!staged.ok) {
        return failure(
          'failed',
          'scaffold',
          `failed: could not stage ${Reference.CLONE_DIR}/.gitkeep: ${staged.message}`,
        );
      }
    }
    const ignoreFile = path.join(root, '.gitignore');
    const current = yield* fs.readFileString(ignoreFile).pipe(Effect.orElseSucceed(() => ''));
    const next = appendIgnoreRule(current);
    if (next !== current) yield* fs.writeFileString(ignoreFile, next);
    return undefined;
  });

  /** Clone into a concrete root. */
  const cloneInto = Effect.fn('GitLifecycle.cloneInto')(function* (
    root: string,
    reference: ReferenceEntry,
  ) {
    const clone = Reference.clonePath(root, reference.name);
    yield* fs.makeDirectory(path.join(root, Reference.CLONE_DIR), { recursive: true });
    const result = yield* git.clone(reference.url, clone);
    return { clone, result } as const;
  });

  /**
   * Remove exactly what an `add` run created; scaffolding is intentionally
   * kept, and a pre-existing entry file is never touched.
   */
  const rollbackAdd = Effect.fn('GitLifecycle.rollbackAdd')(function* (
    root: string,
    slug: string,
    wroteEntry: boolean,
  ) {
    const clone = Reference.clonePath(root, slug);
    const entryDir = path.join(root, Reference.STORE_DIR, slug);
    yield* fs
      .remove(clone, { recursive: true, force: true })
      .pipe(Effect.orElseSucceed(() => undefined));
    if (wroteEntry) {
      yield* fs
        .remove(path.join(entryDir, Reference.ENTRY_FILE), { force: true })
        .pipe(Effect.orElseSucceed(() => undefined));
    }
    yield* fs
      .remove(path.join(entryDir, '.REFERENCE.md.tmp'), { force: true })
      .pipe(Effect.orElseSucceed(() => undefined));
    const remaining = yield* fs
      .readDirectory(entryDir)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    if (remaining.length === 0) {
      yield* fs.remove(entryDir, { force: true }).pipe(Effect.orElseSucceed(() => undefined));
    }
  });

  /** Materialize one entry that is missing locally. */
  const materialize = Effect.fn('GitLifecycle.materialize')(function* (
    root: string,
    reference: ReferenceEntry,
  ) {
    const { clone, result } = yield* cloneInto(root, reference);
    if (!result.ok) {
      return failure(
        'failed',
        'clone-failure',
        `failed: clone ${reference.url} -> ${relativeClone(reference.name)}: ${result.message}`,
      ) satisfies LifecycleFailure;
    }
    const ref = reference.ref?.trim() ?? '';
    if (ref !== '') {
      const targetOutcome = yield* resolveTarget(clone, ref, true);
      if (!targetOutcome.ok) {
        return failureWithSlug(
          'refused',
          'ref-unresolvable',
          reference.name,
          unresolvableMessage(reference.name, ref, reference.url),
        ) satisfies LifecycleFailure;
      }
      const applied = yield* applyTarget(clone, targetOutcome.resolution, false);
      if (!applied.ok) {
        return failureWithSlug(
          'failed',
          'checkout-failure',
          reference.name,
          applyFailureMessage(reference.name, ref, applied),
        ) satisfies LifecycleFailure;
      }
    }
    const head = yield* git.head(clone);
    const branch = ref === '' ? yield* git.defaultBranch(clone) : undefined;
    const created: UpdateCreated = {
      kind: 'created',
      slug: reference.name,
      url: reference.url,
      ref: reference.ref,
      head,
      origin: reference.url,
      upstream: ref === '' ? (branch === undefined ? undefined : `origin/${branch}`) : ref,
      message:
        reference.ref === undefined || reference.ref.trim() === ''
          ? `created ${reference.name} ${reference.url}`
          : `created ${reference.name} ${reference.url} @ ${reference.ref.trim()}`,
    };
    return created satisfies UpdateResult;
  });

  const update = Effect.fn('GitLifecycle.update')(function* (
    root: string,
    target: string,
    options: UpdateOptions = {},
  ) {
    const invocation = invocationOf(options.invocation);
    const force = options.force === true;
    const classification = classifyTarget(target);
    if (classification.kind === 'invalid-url') {
      return failure(
        'refused',
        'invalid-url',
        `refused: invalid url '${target}': ${classification.reason}`,
      );
    }
    if (
      classification.kind === 'name' &&
      (!Reference.isValidName(classification.value) || classification.value.length > 64)
    ) {
      return failure('refused', 'invalid-name', invalidNameMessage(classification.value));
    }
    const loaded = yield* loadReferences(root);
    if (!loaded.present) return storeMissingFailure(invocation);
    const entries = loaded.entries;
    const reference =
      classification.kind === 'url'
        ? entries.find(
            (entry) => Reference.normalizeUrl(entry.url) === Reference.normalizeUrl(target),
          )
        : entries.find((entry) => entry.name === classification.value);
    if (reference === undefined) {
      const unusable =
        classification.kind === 'name'
          ? loaded.invalid.find((entry) => entry.slug === classification.value)
          : loaded.invalid.find(
              (entry) =>
                entry.url !== undefined &&
                Reference.normalizeUrl(entry.url) === Reference.normalizeUrl(target),
            );
      if (unusable !== undefined) return invalidEntryFailure('refused', unusable, invocation);
      if (classification.kind === 'url') {
        return failure(
          'refused',
          'unknown-url',
          `refused: unknown url ${target}; run '${invocation} add ${target}' first`,
        );
      }
      return failure(
        'refused',
        'unknown-reference',
        `refused: unknown reference '${classification.value}'; run '${invocation} list'`,
      );
    }

    const clone = Reference.clonePath(root, reference.name);
    const ownership = yield* checkOwnershipAt(clone, reference);
    if (ownership.kind === 'missing') return yield* materialize(root, reference);
    if (ownership.kind === 'foreign') {
      return failureWithSlug(
        'refused',
        'foreign-origin',
        reference.name,
        ownershipMessage(reference.name, reference, ownership.actual, invocation),
      );
    }

    const dirty = yield* git.isDirty(clone);
    if (!dirty.ok) {
      return failureWithSlug(
        'failed',
        'status-failure',
        reference.name,
        statusFailure(reference.name, dirty.error ?? 'git status did not complete'),
      );
    }
    if (dirty.count > 0 && !force) {
      return failureWithSlug(
        'refused',
        'dirty',
        reference.name,
        dirtyMessage(reference.name, dirty.count, invocation),
      );
    }

    const fetched = yield* git.fetch(clone);
    if (!fetched.ok) {
      const current = yield* git.head(clone);
      return failureWithSlug(
        'failed',
        'fetch-failure',
        reference.name,
        `failed: fetch ${reference.name}: ${fetched.message} (clone unchanged at ${sha7(current)})`,
      );
    }

    const ref = reference.ref?.trim() ?? '';
    if (ref !== '') {
      const targetOutcome = yield* resolveTarget(clone, ref, true);
      if (!targetOutcome.ok) {
        return failureWithSlug(
          'refused',
          'ref-unresolvable',
          reference.name,
          unresolvableMessage(reference.name, ref, reference.url),
        );
      }
      const targetResolution = targetOutcome.resolution;
      if (targetResolution.kind === 'tag') {
        const name = tagName(ref);
        const remoteRows = yield* git.lsRemote(clone, [
          `refs/tags/${name}`,
          `refs/tags/${name}^{}`,
        ]);
        if (!remoteRows.ok) {
          return failureWithSlug(
            'failed',
            'ls-remote-failure',
            reference.name,
            `failed: ls-remote ${reference.name}: ${remoteRows.message}`,
          );
        }
        const remote = resolveRemoteRef(remoteRows.rows, name);
        if (remote === undefined) {
          return failureWithSlug(
            'refused',
            'ref-unresolvable',
            reference.name,
            unresolvableMessage(reference.name, ref, reference.url),
          );
        }
        if (remote !== targetResolution.sha) {
          return failureWithSlug(
            'refused',
            'tag-moved',
            reference.name,
            `refused: ${reference.name} ref '${ref}' now resolves to ${sha7(remote)} upstream, the pin records ${sha7(targetResolution.sha)}; edit the pin in ${Reference.STORE_DIR}/${reference.name}/${Reference.ENTRY_FILE}`,
          );
        }
      }
      const before = yield* git.head(clone);
      if (before !== targetResolution.sha || force) {
        const applied = yield* applyTarget(clone, targetResolution, force);
        if (!applied.ok) {
          return failureWithSlug(
            'failed',
            'checkout-failure',
            reference.name,
            applyFailureMessage(reference.name, ref, applied),
          );
        }
        if (before !== applied.sha) {
          return {
            kind: 'updated',
            slug: reference.name,
            head: applied.sha,
            origin: reference.url,
            upstream: ref,
            message: `updated ${reference.name} head=${sha7(applied.sha)}`,
          } satisfies UpdateResult;
        }
      }
      return {
        kind: 'present',
        slug: reference.name,
        origin: reference.url,
        upstream: ref,
        message: `present ${reference.name}`,
      } satisfies UpdateResult;
    }

    let branch = yield* git.defaultBranch(clone);
    if (branch === undefined) {
      yield* git.setHeadAuto(clone);
      branch = yield* git.defaultBranch(clone);
    }
    if (branch === undefined) {
      return failureWithSlug(
        'refused',
        'no-default-branch',
        reference.name,
        `refused: ${reference.name} has no origin default branch; run '${invocation} sync ${reference.name}'`,
      );
    }
    const targetRef = `refs/remotes/origin/${branch}`;
    const targetResolution = yield* git.resolveRef(clone, targetRef);
    if (!targetResolution.resolved || targetResolution.sha === undefined) {
      return failureWithSlug(
        'failed',
        'no-upstream',
        reference.name,
        `failed: ${reference.name} has no local ${targetRef}; run '${invocation} sync ${reference.name}'`,
      );
    }
    const counts = yield* git.counts(clone, targetRef);
    if (counts === undefined) {
      return failureWithSlug(
        'failed',
        'count-failure',
        reference.name,
        `failed: cannot count ${reference.name} against ${targetRef}`,
      );
    }
    const before = yield* git.head(clone);
    const current = yield* git.currentBranch(clone);
    if (current === branch) {
      if (counts.ahead > 0 && !force) {
        return failureWithSlug(
          'refused',
          'ahead',
          reference.name,
          aheadMessage(reference.name, branch, counts.ahead, counts.behind),
        );
      }
      if (force) {
        const reset = yield* git.resetHard(clone, targetResolution.sha);
        if (!reset.ok) {
          return failureWithSlug(
            'failed',
            'reset-failure',
            reference.name,
            forceFailure(reference.name, 'reset', reset.message, yield* git.head(clone)),
          );
        }
        const cleaned = yield* git.clean(clone);
        if (!cleaned.ok) {
          return failureWithSlug(
            'failed',
            'clean-failure',
            reference.name,
            forceFailure(reference.name, 'clean', cleaned.message, yield* git.head(clone)),
          );
        }
      } else if (counts.behind > 0) {
        const merged = yield* git.fastForward(clone, targetRef);
        if (!merged.ok) {
          return failureWithSlug(
            'refused',
            'ahead',
            reference.name,
            aheadMessage(reference.name, branch, counts.ahead, counts.behind),
          );
        }
      }
      const after = yield* git.head(clone);
      if (after !== targetResolution.sha) {
        return failureWithSlug(
          'failed',
          'head-mismatch',
          reference.name,
          `failed: ${reference.name} HEAD is ${sha7(after)}, expected ${sha7(targetResolution.sha)}`,
        );
      }
      if (before !== after) {
        return {
          kind: 'updated',
          slug: reference.name,
          head: after,
          branch,
          origin: reference.url,
          upstream: `origin/${branch}`,
          message: `updated ${reference.name} head=${sha7(after)}`,
        } satisfies UpdateResult;
      }
      return {
        kind: 'present',
        slug: reference.name,
        origin: reference.url,
        upstream: `origin/${branch}`,
        message: `present ${reference.name}`,
      } satisfies UpdateResult;
    }

    if (counts.ahead > 0 && !force) {
      return failureWithSlug(
        'refused',
        'unique-commits',
        reference.name,
        uniqueCommitsMessage(current ?? 'HEAD', counts.ahead, branch),
      );
    }
    const switched = yield* git.checkoutBranch(clone, branch, targetRef, force);
    if (!switched.ok) {
      return failureWithSlug(
        'failed',
        'checkout-failure',
        reference.name,
        `failed: checkout ${reference.name} branch ${branch}: ${switched.message} (HEAD ${sha7(before)})`,
      );
    }
    if (force) {
      const reset = yield* git.resetHard(clone, targetResolution.sha);
      if (!reset.ok) {
        return failureWithSlug(
          'failed',
          'reset-failure',
          reference.name,
          forceFailure(reference.name, 'reset', reset.message, yield* git.head(clone)),
        );
      }
      const cleaned = yield* git.clean(clone);
      if (!cleaned.ok) {
        return failureWithSlug(
          'failed',
          'clean-failure',
          reference.name,
          forceFailure(reference.name, 'clean', cleaned.message, yield* git.head(clone)),
        );
      }
    }
    const after = yield* git.head(clone);
    if (after !== targetResolution.sha) {
      return failureWithSlug(
        'failed',
        'head-mismatch',
        reference.name,
        `failed: ${reference.name} HEAD is ${sha7(after)}, expected ${sha7(targetResolution.sha)}`,
      );
    }
    return {
      kind: 'updated',
      slug: reference.name,
      head: after,
      branch,
      origin: reference.url,
      upstream: `origin/${branch}`,
      message: `updated ${reference.name} head=${sha7(after)}`,
    } satisfies UpdateResult;
  });

  const add = Effect.fn('GitLifecycle.add')(function* (root: string, input: AddInput) {
    const invocation = invocationOf(input.invocation);
    const repo = yield* git.isRepo(root);
    if (!repo.available) {
      return failure('failed', 'git-missing', 'failed: git is not installed or not on PATH');
    }
    if (!repo.workTree) {
      return failure(
        'failed',
        'not-work-tree',
        `failed: ${root} is not a git work tree; run '${invocation} add --dir <repo-root>' from inside a work tree`,
      );
    }

    const validation = Reference.validateUrl(input.url);
    if (!validation.valid) {
      return failure(
        'refused',
        'invalid-url',
        `refused: invalid url '${input.url}': ${validation.reason ?? 'invalid url'}`,
      );
    }

    if (
      input.name !== undefined &&
      (!Reference.isValidName(input.name) || input.name.length > 64)
    ) {
      return failure('refused', 'invalid-name', invalidNameMessage(input.name));
    }
    if (input.ref !== undefined && !Reference.isValidRef(input.ref.trim())) {
      return failure(
        'refused',
        'invalid-ref',
        `refused: invalid ref '${input.ref}': must be a branch, tag, or 7-40 char commit id`,
      );
    }
    const purpose = input.purpose?.trim();
    if (purpose !== undefined) {
      const reason = purposeReason(purpose);
      if (reason !== undefined) {
        return failure(
          'refused',
          'invalid-purpose',
          `refused: invalid purpose '${purpose}': ${reason}`,
        );
      }
    }

    const url = input.url.trim();
    const loaded = yield* loadReferences(root);
    const entries = loaded.entries;
    const storeNames = yield* store.names(root);
    const alreadyRegistered = entries.find(
      (entry) => Reference.normalizeUrl(entry.url) === Reference.normalizeUrl(url),
    );
    if (alreadyRegistered !== undefined) {
      const requestedRef = input.ref?.trim() ?? '';
      if (requestedRef !== '' && requestedRef !== (alreadyRegistered.ref ?? '')) {
        return failure(
          'refused',
          'usage',
          `refused: --ref applies only when registering; ${alreadyRegistered.name} is already registered${
            alreadyRegistered.ref === undefined ? '' : ` at ref '${alreadyRegistered.ref}'`
          } — edit the pin in ${Reference.STORE_DIR}/${alreadyRegistered.name}/${Reference.ENTRY_FILE}`,
        );
      }
      const notice = `routed add -> update ${alreadyRegistered.name}: ${url} is already registered as ${alreadyRegistered.name}`;
      const updateResult = yield* update(root, alreadyRegistered.name, { invocation });
      return {
        kind: 'routed',
        slug: alreadyRegistered.name,
        url,
        notice,
        update: updateResult,
        message: notice,
      } satisfies AddResult;
    }
    const unusable = loaded.invalid.find(
      (entry) =>
        entry.url !== undefined &&
        Reference.normalizeUrl(entry.url) === Reference.normalizeUrl(url),
    );
    if (unusable !== undefined) return invalidEntryFailure('refused', unusable, invocation);

    const slug = input.name ?? Reference.deriveSlug(url);
    if (slug === undefined) {
      return failure(
        'refused',
        'cannot-derive-slug',
        `refused: cannot derive a slug from ${url}; pass --name <slug>`,
      );
    }
    const occupied = entries.find((entry) => entry.name === slug);
    if (occupied !== undefined) {
      return failure('refused', 'slug-collision', collisionMessage(slug, occupied.url, url));
    }
    if (storeNames.includes(slug)) {
      return failure(
        'refused',
        'slug-collision',
        `refused: slug '${slug}' already has an entry directory at ${Reference.entryPath(slug)} that does not decode; fix that entry, remove it, or pass --name <other-slug> to register ${url} under a different name`,
      );
    }
    if (purpose === undefined) {
      return failure(
        'refused',
        'purpose-required',
        'refused: --purpose is required to register a reference',
      );
    }

    const clone = Reference.clonePath(root, slug);
    const link = yield* fs.readLink(clone).pipe(Effect.option);
    const exists = yield* fs.exists(clone);
    if (exists || Option.isSome(link)) {
      return failure('refused', 'orphan-path', entryExistsMessage(slug, invocation));
    }

    const scaffolded = yield* scaffold(root);
    if (scaffolded !== undefined) return scaffolded;

    const cloned = yield* git.clone(url, clone);
    if (!cloned.ok) {
      yield* rollbackAdd(root, slug, false);
      return failure(
        'failed',
        'clone-failure',
        `failed: clone ${url} -> ${relativeClone(slug)}: ${cloned.message}`,
      );
    }

    const ref = input.ref?.trim();
    if (ref !== undefined && ref !== '') {
      const resolution = yield* resolveTarget(clone, ref, true);
      if (!resolution.ok) {
        yield* rollbackAdd(root, slug, false);
        return failure(
          'refused',
          'ref-unresolvable',
          `refused: ${slug} ref '${ref}' does not resolve in ${url}; nothing was written`,
        );
      }
      const applied = yield* applyTarget(clone, resolution.resolution, false);
      if (!applied.ok) {
        yield* rollbackAdd(root, slug, false);
        return failure('failed', 'checkout-failure', applyFailureMessage(slug, ref, applied));
      }
    }

    const now = yield* Clock.currentTimeMillis;
    const added = new Date(now).toISOString().slice(0, 10);
    const fields = { name: slug, url, purpose, added };
    const reference =
      ref === undefined || ref === ''
        ? Reference.Reference.make(fields)
        : Reference.Reference.make({ ...fields, ref });
    const written = yield* store.write(root, reference, '\n# Notes\n').pipe(
      Effect.match({
        onFailure: (error) => error,
        onSuccess: () => undefined,
      }),
    );
    if (written !== undefined) {
      yield* rollbackAdd(root, slug, false);
      return failure(
        'failed',
        'write-failure',
        `failed: could not write ${Reference.STORE_DIR}/${slug}/${Reference.ENTRY_FILE}: ${written.reason}; clone removed`,
      );
    }
    return {
      kind: 'created',
      slug,
      url,
      ref,
      head: yield* git.head(clone),
      message: `created ${slug} ${url}`,
    } satisfies AddResult;
  });

  const sync = Effect.fn('GitLifecycle.sync')(function* (root: string, options: SyncOptions = {}) {
    const invocation = invocationOf(options.invocation);
    if (
      options.name !== undefined &&
      (!Reference.isValidName(options.name) || options.name.length > 64)
    ) {
      return failure('refused', 'invalid-name', invalidNameMessage(options.name));
    }
    const loaded = yield* loadReferences(root);
    if (!loaded.present) return storeMissingFailure(invocation);
    const entries = loaded.entries;
    if (options.name !== undefined && options.all === true) {
      return failure('refused', 'usage', 'usage: pass either <name> or --all, not both');
    }
    if (options.name === undefined && options.all !== true) {
      return failure(
        'refused',
        'usage',
        `usage: ${invocation} sync <name> (or ${invocation} sync --all)`,
      );
    }
    let selected: ReadonlyArray<ReferenceEntry>;
    if (options.name !== undefined) {
      const one = entries.find((entry) => entry.name === options.name);
      if (one === undefined) {
        const unusable = loaded.invalid.find((entry) => entry.slug === options.name);
        if (unusable !== undefined) return invalidEntryFailure('refused', unusable, invocation);
        return failure(
          'refused',
          'unknown-reference',
          `refused: unknown reference '${options.name}'; run '${invocation} list'`,
        );
      }
      selected = [one];
    } else {
      selected = entries;
    }

    yield* fs.makeDirectory(path.join(root, Reference.CLONE_DIR), { recursive: true });
    const results: Array<SyncEntry> = [];
    for (const reference of selected) {
      const clone = Reference.clonePath(root, reference.name);
      const ownership = yield* checkOwnershipAt(clone, reference);
      if (ownership.kind === 'missing') {
        const { result } = yield* cloneInto(root, reference);
        if (!result.ok) {
          results.push({
            kind: 'failed',
            slug: reference.name,
            message: `failed ${reference.name} clone: ${result.message}`,
          });
          continue;
        }
        const ref = reference.ref?.trim() ?? '';
        if (ref !== '') {
          const target = yield* resolveTarget(clone, ref, false);
          if (!target.ok) {
            results.push({
              kind: 'skipped',
              slug: reference.name,
              message: `skipped ${reference.name} ref '${ref}' unresolvable (run '${invocation} update ${reference.name}')`,
            });
            continue;
          }
          const applied = yield* applyTarget(clone, target.resolution, false);
          if (!applied.ok) {
            results.push({
              kind: 'failed',
              slug: reference.name,
              message: `failed ${reference.name} checkout: ${applied.message}`,
            });
            continue;
          }
        }
        results.push({
          kind: 'created',
          slug: reference.name,
          head: yield* git.head(clone),
          message:
            ref === ''
              ? `created ${reference.name} ${reference.url}`
              : `created ${reference.name} ${reference.url} @ ${ref}`,
        });
        continue;
      }
      if (ownership.kind === 'foreign') {
        results.push({
          kind: 'skipped',
          slug: reference.name,
          message: `skipped ${reference.name} foreign origin ${ownership.actual ?? '(none)'} (run '${invocation} update ${reference.name}')`,
        });
        continue;
      }
      const dirty = yield* git.isDirty(clone);
      if (!dirty.ok) {
        results.push({
          kind: 'failed',
          slug: reference.name,
          message: statusFailure(reference.name, dirty.error ?? 'git status did not complete'),
        });
        continue;
      }
      if (dirty.count > 0) {
        results.push({
          kind: 'skipped',
          slug: reference.name,
          message: `skipped ${reference.name} dirty (run '${invocation} update ${reference.name} --force')`,
        });
        continue;
      }
      const ref = reference.ref?.trim() ?? '';
      if (ref !== '') {
        const resolution = yield* git.resolveRef(clone, ref);
        if (!resolution.resolved) {
          results.push({
            kind: 'skipped',
            slug: reference.name,
            message: `skipped ${reference.name} ref '${ref}' unresolvable (run '${invocation} update ${reference.name}')`,
          });
          continue;
        }
        const current = yield* git.head(clone);
        if (current !== resolution.sha) {
          const applied = yield* applyTarget(clone, resolution, false);
          if (!applied.ok) {
            results.push({
              kind: 'failed',
              slug: reference.name,
              message: `failed ${reference.name} checkout: ${applied.message}`,
            });
            continue;
          }
          results.push({
            kind: 'updated',
            slug: reference.name,
            head: applied.head,
            message: `updated ${reference.name} @ ${ref}`,
          });
          continue;
        }
        results.push({
          kind: 'ok',
          slug: reference.name,
          head: resolution.sha,
          message: `ok ${reference.name}`,
        });
        continue;
      }

      let branch = yield* git.defaultBranch(clone);
      if (branch === undefined) {
        // A stale `origin/HEAD` (upstream renamed its default branch) is the one
        // repairable cause; sync is a repair verb, so refresh and retry once.
        const fetched = yield* git.fetch(clone);
        if (fetched.ok) yield* git.setHeadAuto(clone);
        branch = yield* git.defaultBranch(clone);
      }
      if (branch === undefined) {
        results.push({
          kind: 'skipped',
          slug: reference.name,
          message: `skipped ${reference.name} has no default branch (run '${invocation} update ${reference.name}')`,
        });
        continue;
      }
      const currentBranchName = yield* git.currentBranch(clone);
      if (currentBranchName === branch) {
        results.push({
          kind: 'ok',
          slug: reference.name,
          head: yield* git.head(clone),
          message: `ok ${reference.name}`,
        });
        continue;
      }
      const targetRef = `refs/remotes/origin/${branch}`;
      const targetResolution = yield* git.resolveRef(clone, targetRef);
      if (!targetResolution.resolved || targetResolution.sha === undefined) {
        results.push({
          kind: 'skipped',
          slug: reference.name,
          message: `skipped ${reference.name} has no ${targetRef} (run '${invocation} update ${reference.name}')`,
        });
        continue;
      }
      const counts = yield* git.counts(clone, targetRef);
      if (counts !== undefined && counts.ahead > 0) {
        results.push({
          kind: 'skipped',
          slug: reference.name,
          message: `skipped ${reference.name} branch '${currentBranchName ?? 'HEAD'}' has ${counts.ahead} commits not on origin/${branch} (run '${invocation} update ${reference.name} --force')`,
        });
        continue;
      }
      const switched = yield* git.checkoutBranch(clone, branch, targetRef, false);
      if (!switched.ok) {
        results.push({
          kind: 'failed',
          slug: reference.name,
          message: `failed ${reference.name} checkout: ${switched.message}`,
        });
        continue;
      }
      const after = yield* git.head(clone);
      if (after !== targetResolution.sha) {
        results.push({
          kind: 'failed',
          slug: reference.name,
          message: `failed ${reference.name} HEAD is ${sha7(after)}, expected ${sha7(targetResolution.sha)}`,
        });
        continue;
      }
      results.push({
        kind: 'updated',
        slug: reference.name,
        head: after,
        message: `updated ${reference.name} branch ${branch}`,
      });
    }
    if (options.name === undefined) {
      for (const entry of loaded.invalid) {
        results.push({
          kind: 'failed',
          slug: entry.slug,
          message: `failed ${entry.slug} entry is unusable (${entry.reason}); run '${invocation} verify ${entry.slug}'`,
        });
      }
    }
    return {
      entries: results,
      failed: results.some((entry) => entry.kind === 'skipped' || entry.kind === 'failed'),
    } satisfies SyncReport;
  });

  const status = Effect.fn('GitLifecycle.status')(function* (
    root: string,
    options: StatusOptions = {},
  ) {
    const invocation = invocationOf(options.invocation);
    if (
      options.name !== undefined &&
      (!Reference.isValidName(options.name) || options.name.length > 64)
    ) {
      return failure('refused', 'invalid-name', invalidNameMessage(options.name));
    }
    const loaded = yield* loadReferences(root);
    if (!loaded.present) return storeMissingFailure(invocation);
    const entries = loaded.entries;
    let selected: ReadonlyArray<ReferenceEntry>;
    if (options.name !== undefined) {
      const one = entries.find((entry) => entry.name === options.name);
      if (one === undefined) {
        const unusable = loaded.invalid.find((entry) => entry.slug === options.name);
        if (unusable !== undefined) return invalidEntryFailure('refused', unusable, invocation);
        return failure(
          'refused',
          'unknown-reference',
          `refused: unknown reference '${options.name}'; run '${invocation} list'`,
        );
      }
      selected = [one];
    } else {
      selected = entries;
    }

    const rows: Array<StatusRow> = [];
    const details = new Map<
      string,
      { origin?: string | undefined; head?: string | undefined; upstream?: string | undefined }
    >();
    for (const reference of selected) {
      const observed = yield* probe.probe(root, reference);
      const slug = reference.name;
      details.set(slug, { origin: observed.origin, head: observed.head });
      if (!observed.present) {
        rows.push({ slug, state: 'missing', message: `missing ${slug}`, refused: false });
        continue;
      }
      if (!observed.isDirectory || !observed.gitWorkTree) {
        rows.push({
          slug,
          state: 'foreign',
          message: ownershipMessage(slug, reference, '(not a git work tree)', invocation),
          refused: true,
        });
        continue;
      }
      if (!observed.matchesOrigin) {
        rows.push({
          slug,
          state: 'foreign',
          message: ownershipMessage(slug, reference, observed.origin, invocation),
          refused: true,
        });
        continue;
      }
      if (observed.dirtyError !== undefined) {
        rows.push({
          slug,
          state: 'dirty',
          message: `dirty ${slug} unreadable`,
          refused: true,
          failure: failureWithSlug(
            'failed',
            'status-failure',
            slug,
            statusFailure(slug, observed.dirtyError),
          ),
        });
        continue;
      }
      if (observed.dirtyPaths > 0) {
        rows.push({
          slug,
          state: 'dirty',
          message: `dirty ${slug} files=${observed.dirtyPaths}`,
          refused: false,
        });
        continue;
      }

      const ref = reference.ref?.trim() ?? '';
      let row: StatusRow;
      if (ref !== '') {
        if (observed.refResolved === false) {
          row = {
            slug,
            state: 'ref-mismatch',
            message: `ref-mismatch ${slug} ref=${ref} unresolvable`,
            refused: false,
          };
        } else if (!observed.matchesRef) {
          row = {
            slug,
            state: 'ref-mismatch',
            message: `ref-mismatch ${slug} head=${sha7(observed.head)} expected=${sha7(observed.resolvedRefHead)}`,
            refused: false,
          };
        } else {
          row = { slug, state: 'present', message: `present ${slug}`, refused: false };
        }
      } else {
        const branch = observed.defaultBranch;
        if (branch !== undefined) {
          details.set(slug, { ...details.get(slug), upstream: `origin/${branch}` });
        }
        const comparison = compareUnpinned(observed.currentRef, branch);
        if (comparison.kind === 'no-upstream') {
          row = {
            slug,
            state: 'ref-mismatch',
            message: `ref-mismatch ${slug} no-upstream`,
            refused: false,
          };
        } else if (comparison.kind === 'detached') {
          row = {
            slug,
            state: 'ref-mismatch',
            message: `ref-mismatch ${slug} detached expected=${comparison.expected}`,
            refused: false,
          };
        } else if (comparison.kind === 'branch') {
          row = {
            slug,
            state: 'ref-mismatch',
            message: `ref-mismatch ${slug} branch=${comparison.current} expected=${comparison.expected}`,
            refused: false,
          };
        } else {
          row = { slug, state: 'present', message: `present ${slug}`, refused: false };
        }
      }

      if (options.fetch === true && row.state === 'present') {
        const fetched = yield* git.fetch(observed.path);
        if (!fetched.ok) {
          row = {
            ...row,
            refused: true,
            failure: failureWithSlug(
              'failed',
              'fetch-failure',
              slug,
              `failed ${slug} fetch: ${fetched.message}`,
            ),
          };
        } else if (ref === '') {
          const branch = observed.defaultBranch;
          if (branch !== undefined) {
            const counts = yield* git.counts(observed.path, `refs/remotes/origin/${branch}`);
            if (counts !== undefined) {
              row = {
                ...row,
                behind: counts.behind,
                ahead: counts.ahead,
                message: `present ${slug}${counts.behind > 0 ? ` behind=${counts.behind}` : ''}${counts.ahead > 0 ? ` ahead=${counts.ahead}` : ''}`,
              };
            }
          }
        } else {
          const resolution = yield* git.resolveRef(observed.path, ref);
          if (resolution.kind === 'tag') {
            const name = tagName(ref);
            const remoteRows = yield* git.lsRemote(observed.path, [
              `refs/tags/${name}`,
              `refs/tags/${name}^{}`,
            ]);
            if (!remoteRows.ok) {
              row = {
                ...row,
                refused: true,
                failure: failureWithSlug(
                  'failed',
                  'ls-remote-failure',
                  slug,
                  `failed ${slug} ls-remote: ${remoteRows.message}`,
                ),
              };
            } else {
              const remote = resolveRemoteRef(remoteRows.rows, name);
              if (remote === undefined) {
                row = {
                  slug,
                  state: 'ref-mismatch',
                  message: `ref-mismatch ${slug} ref=${ref} unresolvable`,
                  refused: false,
                };
              } else if (remote !== resolution.sha) {
                row = {
                  slug,
                  state: 'ref-mismatch',
                  message: `ref-mismatch ${slug} ref=${ref} expected=${sha7(resolution.sha)} remote=${sha7(remote)}`,
                  refused: false,
                };
              }
            }
          } else if (!resolution.resolved) {
            row = {
              slug,
              state: 'ref-mismatch',
              message: `ref-mismatch ${slug} ref=${ref} unresolvable`,
              refused: false,
            };
          } else if (resolution.sha !== undefined && resolution.sha !== observed.head) {
            row = {
              slug,
              state: 'ref-mismatch',
              message: `ref-mismatch ${slug} head=${sha7(observed.head)} expected=${sha7(resolution.sha)}`,
              refused: false,
            };
          }
        }
      }
      rows.push(row);
    }

    if (options.name === undefined) {
      for (const entry of loaded.invalid) {
        rows.push({
          slug: entry.slug,
          state: 'invalid',
          message: `invalid ${entry.slug} ${entry.reason}`,
          refused: true,
          failure: invalidEntryFailure('failed', entry, invocation),
        });
      }
    }

    const enriched: ReadonlyArray<StatusRow> = rows.map((row) => ({
      ...row,
      path: relativeClone(row.slug),
      ...details.get(row.slug),
    }));
    const missing = enriched.filter((row) => row.state === 'missing').length;
    const present = enriched.filter((row) => row.state === 'present').length;
    const dirty = enriched.filter((row) => row.state === 'dirty').length;
    const mismatch = enriched.filter((row) => row.state === 'ref-mismatch').length;
    const foreign = enriched.filter((row) => row.state === 'foreign').length;
    const invalidRows = enriched.filter((row) => row.state === 'invalid').length;
    const summary = `summary total=${enriched.length} missing=${missing} present=${present} dirty=${dirty} ref-mismatch=${mismatch} foreign=${foreign} invalid=${invalidRows}`;
    return {
      rows: enriched,
      summary,
      refused: enriched.some((row) => row.refused),
    } satisfies StatusReport;
  });

  return { add, update, sync, status } as const;
});

/** Classify one `update` target as a URL, a name, or an invalid URL. */
type TargetClassification =
  | { readonly kind: 'url' }
  | { readonly kind: 'name'; readonly value: string }
  | { readonly kind: 'invalid-url'; readonly reason: string };

const classifyTarget = (target: string): TargetClassification => {
  const looksLikeUrl =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(target) ||
    /^[^@\s/]+@[^:\s]+:/.test(target) ||
    target.startsWith('/') ||
    target.startsWith('./') ||
    target.startsWith('../') ||
    target.startsWith('~/');
  if (!looksLikeUrl) return { kind: 'name', value: target };
  const validation = Reference.validateUrl(target);
  if (validation.valid) return { kind: 'url' };
  return { kind: 'invalid-url', reason: validation.reason ?? 'invalid url' };
};

export const Id = '@montflow/GitLifecycle';
export type Id = typeof Id;

export type Impl = GitLifecycleImpl;

/** Store/git lifecycle operations over one workspace root. */
export class GitLifecycle extends Context.Service<GitLifecycle, GitLifecycleImpl>()(Id) {}

export const Default = Layer.effect(GitLifecycle, make);
