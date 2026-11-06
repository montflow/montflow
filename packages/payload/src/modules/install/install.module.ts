import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Data, Effect, FileSystem, Layer, Match, Path, Predicate, Result } from 'effect';
import {
  PAYLOAD_FORMS,
  REQUIRED_TREE_FILE,
  type LoadedManifest,
  type PayloadEntry,
  type PayloadKind,
} from '../manifest/index.js';
import type { EmbeddedPayload, PayloadFiles } from '../embed/index.js';

/**
 * The one install/compare engine behind every `mf-* doctor`.
 *
 * Repair is the default; `check` reports only and writes nothing — not a temp
 * file, not a `makeDirectory`. Both modes read the same manifest and the same
 * packaged bytes, so a payload cannot be installable but unverifiable.
 */

/** Stable codes for every failure a payload can report. */
export type DoctorCode =
  | 'doctor.manifest-missing'
  | 'doctor.read'
  | 'doctor.write'
  | 'doctor.create'
  | 'doctor.payload'
  | 'doctor.invalid'
  | 'doctor.symlink'
  | 'doctor.not-file';

/**
 * A coded failure carried on a `blocked` payload instead of aborting the run,
 * so the cause chain, path, and class survive to the report.
 */
export class DoctorError extends Data.TaggedError('@montflow/DoctorError')<{
  /** Stable, greppable failure class. */
  readonly code: DoctorCode;
  /** File or directory the operation failed on. */
  readonly path: string;
  /** Operation that failed. */
  readonly operation: string;
  /** What went wrong, as a human sentence. */
  readonly problem: string;
  /** Preserved underlying failure. */
  readonly cause?: unknown;
  /** Concrete edit or command that repairs this payload. */
  readonly fix?: string;
}> {}

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** True when a platform failure is the absence of a path, not a denial. */
const isNotFound = (cause: unknown): boolean =>
  Predicate.hasProperty(cause, 'reason') && Predicate.isTagged(cause.reason, 'NotFound');

/** A failure being filled in, so absent optional fields stay absent. */
interface MutableDoctorError {
  code: DoctorCode;
  path: string;
  operation: string;
  problem: string;
  cause?: unknown;
  fix?: string;
}

/** Build one coded failure, preserving the cause and omitting absent optionals. */
const doctorError = (input: {
  readonly code: DoctorCode;
  readonly path: string;
  readonly operation: string;
  readonly problem: string;
  readonly cause?: unknown;
  readonly fix?: string | undefined;
}): DoctorError => {
  const built: MutableDoctorError = {
    code: input.code,
    path: input.path,
    operation: input.operation,
    problem: input.problem,
  };
  if (input.cause !== undefined) built.cause = input.cause;
  if (input.fix !== undefined) built.fix = input.fix;
  return new DoctorError(built);
};

/** Check mode statuses. */
export type CheckStatus = 'ok' | 'missing' | 'stale' | 'mismatched' | 'blocked';

/** Repair mode statuses. */
export type RepairStatus = 'present' | 'installed' | 'repaired' | 'blocked';

/** Every status one payload can report. */
export type PayloadStatusValue = CheckStatus | RepairStatus;

/** Outcome for one manifest entry. */
export interface PayloadInstall {
  /** Artifact kind; always set by the engine. */
  readonly kind?: PayloadKind;
  readonly name: string;
  readonly status: PayloadStatusValue;
  /** Package location the payload came from, or `embedded in this build`. */
  readonly source: string;
  /** Where the payload lives in the workspace. */
  readonly target: string;
  /** One-line explanation of what differed or what doctor did. */
  readonly detail?: string;
  /** Installed files the package does not ship; never drift, never removed. */
  readonly extras?: ReadonlyArray<string>;
  /** Coded failure for a `blocked` payload; absent otherwise. */
  readonly failure?: DoctorError;
}

/** Outcome of one doctor run. */
export interface PayloadDoctorResult {
  /** `drifted` on anything unhealthy, `installed` when repair wrote, else `ok`/`present`. */
  readonly status: 'ok' | 'present' | 'installed' | 'drifted';
  /** True when nothing is missing, stale, mismatched, or blocked. */
  readonly healthy: boolean;
  /** Workspace root the payloads live under. */
  readonly root: string;
  /** Package the manifest belongs to. */
  readonly package: string;
  /** What the report calls the payload set, e.g. `skills`. */
  readonly subject: string;
  /** One outcome per manifest entry, in manifest order. */
  readonly payloads: ReadonlyArray<PayloadInstall>;
  /** Payloads of kind `skill`. */
  readonly skills: ReadonlyArray<PayloadInstall>;
  /** Payloads of kind `profile`. */
  readonly profiles: ReadonlyArray<PayloadInstall>;
  /** Payloads of kind `prompt`. */
  readonly prompts: ReadonlyArray<PayloadInstall>;
  /** Payloads of kind `tier`. */
  readonly tiers: ReadonlyArray<PayloadInstall>;
  /** Payloads of kind `rigor`. */
  readonly rigors: ReadonlyArray<PayloadInstall>;
  /** A manifest that could not be read is a blocked run, never an empty success. */
  readonly manifestFailure?: DoctorError;
  /** Human-readable report. */
  readonly message: string;
}

/** How to run: repair what can be repaired, or only report. */
export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
  /** Package root that owns the manifest's `source` paths. */
  readonly packageRoot: string;
  /** The generated embed carried by the caller's compiled binary. */
  readonly embedded: EmbeddedPayload;
  /** How the caller reaches doctor, used in the repair line. */
  readonly invocation?: string | undefined;
  /** What the report calls the payload set. */
  readonly subject?: string | undefined;
  /** Optional per-package validation of packaged file bytes (prompts). */
  readonly validate?: ((entry: PayloadEntry, text: string) => string | undefined) | undefined;
}

/** A packaged payload's files and where they came from. */
export interface ResolvedPayload {
  readonly files: PayloadFiles;
  readonly origin: 'package' | 'embedded';
  /** Human-readable location shown in the report. */
  readonly source: string;
}

/** One file's contents, or undefined when it is absent. */
const readIfPresent = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string | undefined> =>
  fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));

/** Read every file of a flat tree, or undefined when it is not a complete tree. */
const readTreeFromPackage = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
  required: string | undefined,
): Effect.Effect<PayloadFiles | undefined> =>
  Effect.gen(function* () {
    const listed = yield* fs.readDirectory(dir).pipe(Effect.result);
    if (Result.isFailure(listed)) return undefined;
    const names = listed.success.filter((entry) => !entry.startsWith('.')).toSorted();
    if (required !== undefined && !names.includes(required)) return undefined;
    const files: Record<string, string> = {};
    for (const name of names) {
      const info = yield* fs.stat(path.join(dir, name)).pipe(Effect.result);
      if (Result.isFailure(info) || info.success.type !== 'File') return undefined;
      const text = yield* readIfPresent(fs, path.join(dir, name));
      if (text === undefined) return undefined;
      files[name] = text;
    }
    return files;
  });

/** Resolve one entry, preferring the package directory and falling back to the embed. */
export const resolvePayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  packageRoot: string,
  entry: PayloadEntry,
  embedded: EmbeddedPayload,
): Effect.Effect<ResolvedPayload | undefined> =>
  Effect.gen(function* () {
    const source = path.join(packageRoot, entry.source);
    const fromDisk =
      PAYLOAD_FORMS[entry.kind] === 'tree'
        ? yield* readTreeFromPackage(fs, path, source, REQUIRED_TREE_FILE[entry.kind])
        : yield* readIfPresent(fs, source).pipe(
            Effect.map((text) => {
              if (text === undefined) return undefined;
              const basename = entry.source.split('/').at(-1) ?? entry.source;
              return { [basename]: text } satisfies PayloadFiles;
            }),
          );
    if (fromDisk !== undefined) {
      return { files: fromDisk, origin: 'package', source } satisfies ResolvedPayload;
    }
    const files = embedded[entry.kind]?.[entry.name];
    return files === undefined
      ? undefined
      : ({ files, origin: 'embedded', source: 'embedded in this build' } satisfies ResolvedPayload);
  });

/** An installed tree, described without following symbolic links. */
type InstalledTree =
  | { readonly kind: 'absent' }
  | { readonly kind: 'symlink'; readonly link: string }
  | { readonly kind: 'unusable'; readonly failure: DoctorError }
  | {
      readonly kind: 'directory';
      readonly names: ReadonlyArray<string>;
      readonly files: Readonly<Record<string, string>>;
      readonly failures: Readonly<Record<string, DoctorError>>;
    };

/** Read an installed tree without ever following a symbolic link. */
const readInstalledTree = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<InstalledTree> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.result);
    if (Result.isSuccess(link)) return { kind: 'symlink', link: link.success };

    const info = yield* fs.stat(target).pipe(Effect.result);
    if (Result.isFailure(info)) {
      if (isNotFound(info.failure)) return { kind: 'absent' };
      return {
        kind: 'unusable',
        failure: doctorError({
          code: 'doctor.read',
          path: target,
          operation: 'stat',
          problem: `cannot stat '${target}': ${reasonOf(info.failure)}`,
          cause: info.failure,
          fix: `Check the permissions on '${target}' and its parent directory.`,
        }),
      };
    }
    if (info.success.type !== 'Directory') {
      return {
        kind: 'unusable',
        failure: doctorError({
          code: 'doctor.not-file',
          path: target,
          operation: 'stat',
          problem: `installed path '${target}' is a ${info.success.type.toLowerCase()}, not a directory`,
          fix: `Move '${target}' out of the way and re-run doctor.`,
        }),
      };
    }
    const listed = yield* fs.readDirectory(target).pipe(Effect.result);
    if (Result.isFailure(listed)) {
      return {
        kind: 'unusable',
        failure: doctorError({
          code: 'doctor.read',
          path: target,
          operation: 'readDirectory',
          problem: `cannot read '${target}': ${reasonOf(listed.failure)}`,
          cause: listed.failure,
          fix: `Make '${target}' readable, or remove it and re-run doctor.`,
        }),
      };
    }
    const names = listed.success.filter((entry) => !entry.startsWith('.')).toSorted();
    const files: Record<string, string> = {};
    const failures: Record<string, DoctorError> = {};
    for (const entry of names) {
      const file = path.join(target, entry);
      const read = yield* fs.readFileString(file).pipe(Effect.result);
      if (Result.isSuccess(read)) {
        files[entry] = read.success;
      } else {
        failures[entry] = doctorError({
          code: 'doctor.read',
          path: file,
          operation: 'readFile',
          problem: `cannot read '${file}': ${reasonOf(read.failure)}`,
          cause: read.failure,
          fix: `Make '${file}' readable, or re-run doctor to replace it.`,
        });
      }
    }
    return { kind: 'directory', names, files, failures };
  });

/** An installed single file, described without following symbolic links. */
type InstalledFile =
  | { readonly kind: 'absent' }
  | { readonly kind: 'symlink'; readonly link: string }
  | { readonly kind: 'file'; readonly text: string }
  | { readonly kind: 'unreadable'; readonly failure: DoctorError }
  | { readonly kind: 'unusable'; readonly failure: DoctorError };

/** Read an installed file without following a symbolic link. */
const readInstalledFile = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<InstalledFile> =>
  Effect.gen(function* () {
    const link = yield* fs.readLink(target).pipe(Effect.result);
    if (Result.isSuccess(link)) return { kind: 'symlink', link: link.success };

    const info = yield* fs.stat(target).pipe(Effect.result);
    if (Result.isFailure(info)) {
      if (isNotFound(info.failure)) return { kind: 'absent' };
      return {
        kind: 'unusable',
        failure: doctorError({
          code: 'doctor.read',
          path: target,
          operation: 'stat',
          problem: `cannot stat '${target}': ${reasonOf(info.failure)}`,
          cause: info.failure,
          fix: `Check the permissions on '${target}' and its parent directory.`,
        }),
      };
    }
    if (info.success.type !== 'File') {
      return {
        kind: 'unusable',
        failure: doctorError({
          code: 'doctor.not-file',
          path: target,
          operation: 'stat',
          problem: `installed path '${target}' is a ${info.success.type.toLowerCase()}, not a file`,
          fix: `Move '${target}' out of the way and re-run doctor.`,
        }),
      };
    }
    const read = yield* fs.readFileString(target).pipe(Effect.result);
    if (Result.isFailure(read)) {
      return {
        kind: 'unreadable',
        failure: doctorError({
          code: 'doctor.read',
          path: target,
          operation: 'readFile',
          problem: `cannot read '${target}': ${reasonOf(read.failure)}`,
          cause: read.failure,
          fix: `Make '${target}' readable, or re-run doctor to replace it.`,
        }),
      };
    }
    return { kind: 'file', text: read.success };
  });

/** Failure when an install directory exists but is not a directory. */
const installDirFailure = (
  fs: FileSystem.FileSystem,
  dir: string,
): Effect.Effect<DoctorError | undefined> =>
  Effect.gen(function* () {
    const info = yield* fs.stat(dir).pipe(Effect.result);
    if (Result.isFailure(info)) {
      if (isNotFound(info.failure)) return undefined;
      return doctorError({
        code: 'doctor.read',
        path: dir,
        operation: 'stat',
        problem: `cannot stat '${dir}': ${reasonOf(info.failure)}`,
        cause: info.failure,
        fix: `Check the permissions on '${dir}' and its parent directory.`,
      });
    }
    if (info.success.type === 'Directory') return undefined;
    return doctorError({
      code: 'doctor.create',
      path: dir,
      operation: 'makeDirectory',
      problem: `cannot create '${dir}': a ${info.success.type.toLowerCase()} is in the way`,
      fix: `Remove '${dir}' and re-run doctor.`,
    });
  });

/** Writes left in the target directory, named uniquely per process and call. */
let tempWriteCounter = 0;

/** Write one file atomically: a sibling temp file, then `rename`. */
const writeAtomically = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  text: string,
): Effect.Effect<void, DoctorError> => {
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.doctor-${process.pid}-${tempWriteCounter}`,
  );
  tempWriteCounter += 1;
  const cleanup = fs.remove(temp, { force: true }).pipe(Effect.ignore);
  return Effect.gen(function* () {
    const wrote = yield* fs.writeFileString(temp, text).pipe(Effect.result);
    if (Result.isFailure(wrote)) {
      yield* cleanup;
      return yield* Effect.fail(
        doctorError({
          code: 'doctor.write',
          path: temp,
          operation: 'writeFile',
          problem: `cannot write '${temp}': ${reasonOf(wrote.failure)}`,
          cause: wrote.failure,
          fix: `Check the permissions on '${path.dirname(target)}'.`,
        }),
      );
    }
    const renamed = yield* fs.rename(temp, target).pipe(Effect.result);
    if (Result.isFailure(renamed)) {
      yield* cleanup;
      return yield* Effect.fail(
        doctorError({
          code: 'doctor.write',
          path: target,
          operation: 'rename',
          problem: `cannot replace '${target}': ${reasonOf(renamed.failure)}`,
          cause: renamed.failure,
          fix: `Remove '${target}' or its parent entry and re-run doctor.`,
        }),
      );
    }
  });
};

/** Outcome fields every branch shares. */
interface InstallIdentity {
  readonly kind: PayloadKind;
  readonly name: string;
  readonly source: string;
  readonly target: string;
}

/** Build a `blocked` payload, keeping the coded failure. */
const blocked = (identity: InstallIdentity, failure: DoctorError): PayloadInstall => ({
  kind: identity.kind,
  name: identity.name,
  status: 'blocked',
  source: identity.source,
  target: identity.target,
  detail: failure.problem,
  failure,
});

/** A payload being filled in, so absent optional fields stay absent. */
interface MutablePayloadInstall {
  kind: PayloadKind;
  name: string;
  status: PayloadStatusValue;
  source: string;
  target: string;
  detail?: string;
  extras?: ReadonlyArray<string>;
  failure?: DoctorError;
}

/** Build a `stale` payload, keeping a coded failure when one applies. */
const stale = (
  identity: InstallIdentity,
  detail: string,
  options: {
    readonly failure?: DoctorError | undefined;
    readonly extras?: ReadonlyArray<string> | undefined;
  } = {},
): PayloadInstall => {
  const built: MutablePayloadInstall = {
    kind: identity.kind,
    name: identity.name,
    status: 'stale',
    source: identity.source,
    target: identity.target,
    detail,
  };
  if (options.failure !== undefined) built.failure = options.failure;
  if (options.extras !== undefined && options.extras.length > 0) built.extras = options.extras;
  return built;
};

/** Name the installed files doctor does not own, which it leaves untouched. */
const extrasNote = (extras: ReadonlyArray<string>): string =>
  extras.length === 0 ? '' : `; kept extra files the package does not ship: ${extras.join(', ')}`;

/** How the installed tree differs from the payload, if it does. */
interface TreeDifference {
  readonly drift?: string;
  readonly failure?: DoctorError;
  readonly extras: ReadonlyArray<string>;
  readonly missing: ReadonlyArray<string>;
}

/**
 * Compare the payload against the installed tree, naming the exact difference.
 * Only files the package ships count as drift: extras are user data.
 */
const compareTree = (
  expected: PayloadFiles,
  installed: {
    readonly names: ReadonlyArray<string>;
    readonly files: Readonly<Record<string, string>>;
    readonly failures: Readonly<Record<string, DoctorError>>;
  },
): TreeDifference => {
  const want = Object.keys(expected).toSorted();
  const extras = installed.names.filter((entry) => !want.includes(entry));
  const missing = want.filter((entry) => !installed.names.includes(entry));
  if (missing.length > 0) {
    return { drift: `installed copy is missing: ${missing.join(', ')}`, extras, missing };
  }
  const unreadable = want
    .map((entry) => installed.failures[entry])
    .find((entry) => entry !== undefined);
  if (unreadable !== undefined) {
    return { drift: unreadable.problem, failure: unreadable, extras, missing };
  }
  const differing = want.find((entry) => expected[entry] !== installed.files[entry]);
  if (differing !== undefined) {
    return { drift: `'${differing}' differs from the package`, extras, missing };
  }
  return { extras, missing };
};

/** Install one tree payload: read, compare, and (unless checking) write. */
const installTree = (
  root: string,
  entry: PayloadEntry,
  packaged: ResolvedPayload,
  options: DoctorOptions,
): Effect.Effect<PayloadInstall> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join(root, entry.target);
    const check = options.check === true;
    const identity: InstallIdentity = {
      kind: entry.kind,
      name: entry.name,
      source: packaged.source,
      target,
    };
    const dirFailure = yield* installDirFailure(fs, path.dirname(target));
    if (dirFailure !== undefined) return blocked(identity, dirFailure);

    const installed = yield* readInstalledTree(fs, path, target);

    if (check) {
      return yield* Match.value(installed).pipe(
        Match.discriminatorsExhaustive('kind')({
          absent: () =>
            Effect.succeed({
              kind: entry.kind,
              name: entry.name,
              status: 'missing' as const,
              source: packaged.source,
              target,
              detail: `not installed at '${target}'`,
            }),
          symlink: (copy) =>
            Effect.succeed(blocked(identity, treeSymlinkFailure(target, copy.link))),
          unusable: (copy) => Effect.succeed(blocked(identity, copy.failure)),
          directory: (copy) => {
            const difference = compareTree(packaged.files, copy);
            if (difference.drift === undefined) {
              return Effect.succeed({
                kind: entry.kind,
                name: entry.name,
                status: 'ok' as const,
                source: packaged.source,
                target,
                detail: `up to date${extrasNote(difference.extras)}`,
                extras: difference.extras,
              });
            }
            return Effect.succeed(
              difference.missing.length > 0
                ? {
                    kind: entry.kind,
                    name: entry.name,
                    status: 'mismatched' as const,
                    source: packaged.source,
                    target,
                    detail: `${difference.drift}${extrasNote(difference.extras)}`,
                  }
                : stale(identity, `${difference.drift}${extrasNote(difference.extras)}`, {
                    failure: difference.failure,
                    extras: difference.extras,
                  }),
            );
          },
        }),
      );
    }

    const write = (
      status: 'installed' | 'repaired',
      describe: (written: ReadonlyArray<string>) => string,
    ): Effect.Effect<PayloadInstall> =>
      Effect.gen(function* () {
        const createdDir = yield* fs
          .makeDirectory(path.dirname(target), { recursive: true })
          .pipe(Effect.result);
        if (Result.isFailure(createdDir)) {
          return blocked(
            identity,
            doctorError({
              code: 'doctor.create',
              path: path.dirname(target),
              operation: 'makeDirectory',
              problem: `cannot create '${path.dirname(target)}': ${reasonOf(createdDir.failure)}`,
              cause: createdDir.failure,
              fix: `Remove the file at '${path.dirname(target)}' (or fix its permissions) and re-run doctor.`,
            }),
          );
        }
        const createdTarget = yield* fs
          .makeDirectory(target, { recursive: true })
          .pipe(Effect.result);
        if (Result.isFailure(createdTarget)) {
          return blocked(
            identity,
            doctorError({
              code: 'doctor.create',
              path: target,
              operation: 'makeDirectory',
              problem: `cannot create '${target}': ${reasonOf(createdTarget.failure)}`,
              cause: createdTarget.failure,
              fix: `Remove the entry at '${target}' (or fix its permissions) and re-run doctor.`,
            }),
          );
        }
        const written: Array<string> = [];
        for (const [name, text] of Object.entries(packaged.files)) {
          const file = path.join(target, name);
          const wrote = yield* writeAtomically(fs, path, file, text).pipe(Effect.result);
          if (Result.isFailure(wrote)) {
            return blocked(
              identity,
              doctorError({
                code: wrote.failure.code,
                path: wrote.failure.path,
                operation: wrote.failure.operation,
                problem: `${wrote.failure.problem} (already wrote: ${written.join(', ') || 'none'})`,
                cause: wrote.failure.cause,
                fix: wrote.failure.fix,
              }),
            );
          }
          written.push(name);
        }
        return {
          kind: entry.kind,
          name: entry.name,
          status,
          source: packaged.source,
          target,
          detail: describe(written),
        };
      });

    return yield* Match.value(installed).pipe(
      Match.discriminatorsExhaustive('kind')({
        absent: () => write('installed', (written) => `installed ${written.join(', ')}`),
        symlink: (copy) => Effect.succeed(blocked(identity, treeSymlinkFailure(target, copy.link))),
        unusable: (copy) => Effect.succeed(blocked(identity, copy.failure)),
        directory: (copy) => {
          const difference = compareTree(packaged.files, copy);
          if (difference.drift === undefined) {
            return Effect.succeed({
              kind: entry.kind,
              name: entry.name,
              status: 'present' as const,
              source: packaged.source,
              target,
              detail: `up to date${extrasNote(difference.extras)}`,
              extras: difference.extras,
            });
          }
          return write(
            'repaired',
            (written) =>
              `rewrote ${written.join(', ')} (${difference.drift})${extrasNote(difference.extras)}`,
          );
        },
      }),
    );
  }).pipe(Effect.provide(NodeLive));

/** Coded refusal for a symlinked tree: doctor never writes through a link. */
const treeSymlinkFailure = (target: string, link: string): DoctorError =>
  doctorError({
    code: 'doctor.symlink',
    path: target,
    operation: 'rename',
    problem: `installed payload '${target}' is a symbolic link to '${link}'; doctor will not write through it`,
    fix: `Remove the symlink '${target}' and re-run doctor.`,
  });

/** Install one single-file payload: read, compare, and (unless checking) write. */
const installFile = (
  root: string,
  entry: PayloadEntry,
  packaged: ResolvedPayload,
  options: DoctorOptions,
): Effect.Effect<PayloadInstall> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = path.join(root, entry.target);
    const check = options.check === true;
    const identity: InstallIdentity = {
      kind: entry.kind,
      name: entry.name,
      source: packaged.source,
      target,
    };
    const wanted = Object.values(packaged.files)[0];
    if (wanted === undefined) {
      return blocked(
        identity,
        doctorError({
          code: 'doctor.payload',
          path: packaged.source,
          operation: 'readFile',
          problem: `packaged ${entry.kind} '${entry.name}' carries no bytes`,
          fix: `Restore the packaged ${entry.kind} and reinstall the owning package.`,
        }),
      );
    }
    const problem = options.validate?.(entry, wanted);
    if (problem !== undefined) {
      return blocked(
        identity,
        doctorError({
          code: 'doctor.invalid',
          path: packaged.source,
          operation: 'validate',
          problem: `packaged ${entry.kind} '${entry.name}' ${problem}`,
          fix: `Fix '${packaged.source}', then re-run doctor.`,
        }),
      );
    }

    const dirFailure = yield* installDirFailure(fs, path.dirname(target));
    if (dirFailure !== undefined) return blocked(identity, dirFailure);

    const installed = yield* readInstalledFile(fs, target);

    if (installed.kind === 'file' && installed.text === wanted) {
      return {
        kind: entry.kind,
        name: entry.name,
        status: check ? ('ok' as const) : ('present' as const),
        source: packaged.source,
        target,
        detail: 'up to date',
      };
    }

    const detail = Match.value(installed).pipe(
      Match.discriminatorsExhaustive('kind')({
        file: () => `'${path.basename(target)}' differs from the package`,
        symlink: (copy) =>
          `installed copy is a symbolic link to '${copy.link}'; doctor will replace the link`,
        absent: () => 'not installed',
        unreadable: (copy) => copy.failure.problem,
        unusable: (copy) => copy.failure.problem,
      }),
    );

    if (check) {
      return yield* Match.value(installed).pipe(
        Match.discriminatorsExhaustive('kind')({
          absent: () =>
            Effect.succeed({
              kind: entry.kind,
              name: entry.name,
              status: 'missing' as const,
              source: packaged.source,
              target,
              detail,
            }),
          file: () => Effect.succeed(stale(identity, detail)),
          symlink: () => Effect.succeed(stale(identity, detail)),
          unreadable: (copy) => Effect.succeed(stale(identity, detail, { failure: copy.failure })),
          unusable: (copy) => Effect.succeed(blocked(identity, copy.failure)),
        }),
      );
    }

    const write = (
      status: 'installed' | 'repaired',
      after: string,
    ): Effect.Effect<PayloadInstall> =>
      Effect.gen(function* () {
        const created = yield* fs
          .makeDirectory(path.dirname(target), { recursive: true })
          .pipe(Effect.result);
        if (Result.isFailure(created)) {
          return blocked(
            identity,
            doctorError({
              code: 'doctor.create',
              path: path.dirname(target),
              operation: 'makeDirectory',
              problem: `cannot create '${path.dirname(target)}': ${reasonOf(created.failure)}`,
              cause: created.failure,
              fix: `Remove the file at '${path.dirname(target)}' (or fix its permissions) and re-run doctor.`,
            }),
          );
        }
        const wrote = yield* writeAtomically(fs, path, target, wanted).pipe(Effect.result);
        if (Result.isFailure(wrote)) return blocked(identity, wrote.failure);
        return {
          kind: entry.kind,
          name: entry.name,
          status,
          source: packaged.source,
          target,
          detail: after,
        };
      });

    return yield* Match.value(installed).pipe(
      Match.discriminatorsExhaustive('kind')({
        absent: () => write('installed', 'installed'),
        file: () => write('repaired', `'${path.basename(target)}' differed from the package`),
        symlink: (copy) => write('repaired', `replaced the symbolic link to '${copy.link}'`),
        unreadable: (copy) =>
          write('repaired', `replaced the unreadable copy (${copy.failure.problem})`),
        unusable: (copy) => Effect.succeed(blocked(identity, copy.failure)),
      }),
    );
  }).pipe(Effect.provide(NodeLive));

/** An empty payload list, shared so a blocked manifest needs no type assertion. */
export const EMPTY_PAYLOADS: ReadonlyArray<PayloadInstall> = [];

/** Statuses that are not usable until doctor repairs them. */
export const unhealthyStatus = (status: PayloadStatusValue): boolean =>
  status === 'missing' || status === 'stale' || status === 'mismatched' || status === 'blocked';

/** True when a plain repair run can clear the status. */
export const repairableStatus = (status: PayloadStatusValue): boolean =>
  status === 'missing' || status === 'stale' || status === 'mismatched';

/** One line per payload, with the mark the CLI prints. */
export const payloadLine = (payload: PayloadInstall): string => {
  const mark = !unhealthyStatus(payload.status)
    ? '\u2713'
    : repairableStatus(payload.status)
      ? '+'
      : '\u2717';
  const note =
    payload.status === 'ok' || payload.status === 'present'
      ? (payload.detail ?? 'up to date')
      : payload.status === 'repaired' || payload.status === 'installed'
        ? (payload.detail ?? payload.status)
        : payload.status === 'blocked'
          ? `blocked [${payload.failure?.code ?? 'doctor.blocked'}]: ${payload.detail ?? ''}`
          : (payload.detail ?? payload.status);
  const origin = payload.source === 'embedded in this build' ? ' [embedded]' : '';
  return `${mark} ${payload.name}: ${note}${origin} \u2192 ${payload.target}`;
};

/** The whole report: summary, one line per payload, and the repair line. */
export const payloadDoctorMessage = (
  result: Omit<PayloadDoctorResult, 'message'>,
  invocation: string,
): string => {
  const lines = result.payloads.map(payloadLine);
  const manifestLine =
    result.manifestFailure === undefined
      ? []
      : [
          `\u2717 payload manifest: blocked [${result.manifestFailure.code}]: ${result.manifestFailure.problem}`,
        ];
  if (result.healthy) {
    return result.status === 'installed'
      ? [`+ ${result.subject} installed or repaired.`, ...lines].join('\n')
      : [`\u2713 ${result.subject} are installed and up to date.`, ...lines].join('\n');
  }
  const repairable = result.payloads.some((payload) => repairableStatus(payload.status));
  const fixes = result.payloads.flatMap((payload) =>
    payload.status === 'blocked' && payload.failure?.fix !== undefined
      ? [`Fix: ${payload.failure.fix}`]
      : [],
  );
  const manifestFix =
    result.manifestFailure?.fix === undefined ? [] : [`Fix: ${result.manifestFailure.fix}`];
  return [
    `\u2717 ${result.subject} are not usable.`,
    ...manifestLine,
    ...lines,
    ...manifestFix,
    ...fixes,
    ...(repairable ? [`Run: ${invocation}`] : []),
  ].join('\n');
};

/**
 * Check every manifest entry under `root`, repairing unless `check` is set.
 * One blocked payload never aborts the rest of the run.
 * @param root - workspace root that owns the install directories
 * @param loaded - the package's validated manifest
 * @param options - mode, package root, caller name, and optional validator
 * @returns one outcome per entry plus the aggregate status and report
 */
export const runPayloadDoctor = (
  root: string,
  loaded: LoadedManifest,
  options: DoctorOptions,
): Effect.Effect<PayloadDoctorResult> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const check = options.check === true;
    const invocation = options.invocation ?? 'doctor';
    const subject = options.subject ?? 'payloads';
    const packageName = loaded.ok ? loaded.manifest.package : '@montflow/package';

    if (!loaded.ok) {
      const failure = doctorError({
        code: 'doctor.manifest-missing',
        path: path.join(options.packageRoot, 'payload.json'),
        operation: 'loadManifest',
        problem: `payload manifest is not usable: ${loaded.problem}`,
        fix: `Reinstall ${packageName}, then run \`${invocation}\`.`,
      });
      const result = {
        status: 'drifted' as const,
        healthy: false,
        root,
        package: packageName,
        subject,
        payloads: EMPTY_PAYLOADS,
        skills: EMPTY_PAYLOADS,
        profiles: EMPTY_PAYLOADS,
        prompts: EMPTY_PAYLOADS,
        tiers: EMPTY_PAYLOADS,
        rigors: EMPTY_PAYLOADS,
        manifestFailure: failure,
      };
      return { ...result, message: payloadDoctorMessage(result, invocation) };
    }

    const embedded = options.embedded;
    const payloads = yield* Effect.forEach(loaded.manifest.payloads, (entry) =>
      Effect.gen(function* () {
        const packaged = yield* resolvePayload(fs, path, options.packageRoot, entry, embedded);
        if (packaged === undefined) {
          const source = path.join(options.packageRoot, entry.source);
          return blocked(
            {
              kind: entry.kind,
              name: entry.name,
              source,
              target: path.join(root, entry.target),
            },
            doctorError({
              code: 'doctor.payload',
              path: source,
              operation: 'readFile',
              problem: `packaged ${entry.kind} '${entry.name}' is missing at '${source}' and is not embedded in this build.`,
              fix: `Reinstall ${packageName}, then run \`${invocation}\`.`,
            }),
          );
        }
        return yield* PAYLOAD_FORMS[entry.kind] === 'tree'
          ? installTree(root, entry, packaged, options)
          : installFile(root, entry, packaged, options);
      }),
    );

    const unhealthy = payloads.some((payload) => unhealthyStatus(payload.status));
    const wrote = payloads.some(
      (payload) => payload.status === 'installed' || payload.status === 'repaired',
    );
    const status: PayloadDoctorResult['status'] = unhealthy
      ? 'drifted'
      : wrote
        ? 'installed'
        : check
          ? 'ok'
          : 'present';
    const result = {
      status,
      healthy: !unhealthy,
      root,
      package: packageName,
      subject,
      payloads,
      skills: payloads.filter((payload) => payload.kind === 'skill'),
      profiles: payloads.filter((payload) => payload.kind === 'profile'),
      prompts: payloads.filter((payload) => payload.kind === 'prompt'),
      tiers: payloads.filter((payload) => payload.kind === 'tier'),
      rigors: payloads.filter((payload) => payload.kind === 'rigor'),
    };
    return { ...result, message: payloadDoctorMessage(result, invocation) };
  }).pipe(Effect.provide(NodeLive));

/**
 * Nearest ancestor of `startDir` containing a `.git` entry, so payloads land at
 * the repository root, never a subdirectory. Falls back to `startDir`.
 * @param startDir - directory to search from
 * @returns Effect resolving to the repository root
 */
export const resolveRepoRoot = (startDir: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    let current = startDir;
    for (;;) {
      if (yield* fs.exists(path.join(current, '.git'))) return current;
      const parent = path.dirname(current);
      if (parent === current) return startDir;
      current = parent;
    }
  }).pipe(
    Effect.orElseSucceed(() => startDir),
    Effect.provide(NodeLive),
  );
