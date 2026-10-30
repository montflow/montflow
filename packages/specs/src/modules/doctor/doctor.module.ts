import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Data, Effect, FileSystem, Layer, Match, Path, Predicate, Result, Schema } from 'effect';
import { EMBEDDED_PROMPT_PAYLOAD, EMBEDDED_SKILL_PAYLOAD } from './embedded-payload.generated.js';

/** Skills shipped with the package and installed into a repo. */
export const SPEC_SKILL_NAMES = ['montflow-create-specs', 'montflow-find-specs'] as const;

/** The spec-creation skill name. */
export const CREATE_SPEC_SKILL_NAME = SPEC_SKILL_NAMES[0];

/** The spec-discovery skill name. */
export const FIND_SPECS_SKILL_NAME = SPEC_SKILL_NAMES[1];

/**
 * Prompts shipped with the package and installed into a repo. Doctor owns
 * exactly these files and never reads, rewrites, or deletes any other prompt in
 * the same directory.
 */
export const SPEC_PROMPT_NAMES = ['spec-create', 'spec-execute', 'spec-sizing'] as const;

/** Stable codes for the failure classes `doctor` can report per payload. */
export type DoctorCode =
  | 'doctor.read'
  | 'doctor.write'
  | 'doctor.create'
  | 'doctor.payload'
  | 'doctor.invalid'
  | 'doctor.symlink'
  | 'doctor.not-file';

/**
 * A coded doctor failure. Carried on a `blocked` payload instead of aborting
 * the run, so the cause chain, path, and class survive to the report.
 */
export class DoctorError extends Data.TaggedError('@montflow/DoctorError')<{
  /** Stable, greppable failure class. */
  readonly code: DoctorCode;
  /** File or directory the operation failed on. */
  readonly path: string;
  /** Operation that failed (`stat`, `readFile`, `makeDirectory`, `rename`, `validate`). */
  readonly operation: string;
  /** What went wrong, as a human sentence. */
  readonly problem: string;
  /** Preserved underlying failure (typically a `PlatformError`). */
  readonly cause?: unknown;
  /** Concrete edit or command that repairs this payload. */
  readonly fix?: string;
}> {}

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

import {
  shippedSkillDir,
  installedSkillDir,
  installedPromptDir,
  installedPromptFile,
  shippedPromptFile,
} from './doctor.paths.module.js';

export { installedSkillDir, installedPromptDir, installedPromptFile, shippedPromptFile };

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

/**
 * Outcome for one payload doctor installs — a skill directory or a prompt file.
 *
 * Check mode: `ok` (current), `missing`, `stale` (differs or unreadable, but
 * repairable), or `blocked` (repair cannot clear it; `failure` names why and
 * the fix). Repair mode: `present` (already current, untouched), `installed`
 * (created), `repaired` (rewrote a drifted or partial copy), or `blocked`.
 */
export interface PayloadInstall {
  readonly name: string;
  readonly status: 'ok' | 'missing' | 'stale' | 'present' | 'installed' | 'repaired' | 'blocked';
  /** Package location the payload came from, or `embedded in this build`. */
  readonly source: string;
  /** Where the payload lives in the repo. */
  readonly target: string;
  /** One-line explanation of what differed or what doctor did. */
  readonly detail?: string;
  /** Coded failure for a `blocked` payload; absent otherwise. */
  readonly failure?: DoctorError;
}

/** Outcome for one shipped skill. */
export type SkillInstall = PayloadInstall;

/** Outcome for one shipped prompt file. */
export type PromptInstall = PayloadInstall;

/** Outcome of a doctor run across every shipped skill and prompt. */
export interface DoctorResult {
  /**
   * `drifted` when anything is missing, stale, or blocked.
   * `ok` in `check` mode when every payload is installed and current.
   * `installed` when repair mode wrote at least one payload.
   * `present` when every payload was already installed and nothing was written.
   */
  readonly status: 'ok' | 'present' | 'installed' | 'drifted';
  /** True when nothing is wrong, whether or not doctor had to fix it. */
  readonly healthy: boolean;
  /** Repo root the payloads live under. */
  readonly root: string;
  /** One entry per shipped skill, in {@link SPEC_SKILL_NAMES} order. */
  readonly skills: ReadonlyArray<SkillInstall>;
  /** One entry per shipped prompt, in {@link SPEC_PROMPT_NAMES} order. */
  readonly prompts: ReadonlyArray<PromptInstall>;
}

/** How to run: copy missing payloads in and refresh drifted ones, or only report. */
export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
}

/** A payload's packaged files, and where they came from. */
interface ResolvedSkill {
  readonly files: Readonly<Record<string, string>>;
  readonly source: string;
}

/** A prompt's packaged bytes, and where they came from. */
interface ResolvedPrompt {
  readonly text: string;
  readonly source: string;
}

/** Read a prompt from the package directory, falling back to the embed. */
const readPackagedPrompt = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
): Effect.Effect<ResolvedPrompt, DoctorError> => {
  const file = shippedPromptFile(path, name);
  return fs.readFileString(file).pipe(
    Effect.map((text): ResolvedPrompt => ({ text, source: file })),
    Effect.catch((cause) => {
      const embedded = EMBEDDED_PROMPT_PAYLOAD[name];
      return embedded === undefined
        ? Effect.fail(
            doctorError({
              code: 'doctor.payload',
              path: file,
              operation: 'readFile',
              problem: `packaged prompt '${name}' is not readable at '${file}' and is not embedded in this build`,
              cause,
              fix: 'Reinstall @montflow/specs, or restore packages/specs/prompts.',
            }),
          )
        : Effect.succeed({ text: embedded, source: 'embedded in this build' });
    }),
  );
};

/** Read a skill from the package directory, falling back to the embed. */
const readPackagedSkill = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
): Effect.Effect<ResolvedSkill, DoctorError> => {
  const dir = shippedSkillDir(path, name);
  const fromDisk = Effect.gen(function* () {
    const listed = yield* fs.readDirectory(dir);
    const names = listed.filter((entry) => !entry.startsWith('.')).toSorted();
    if (!names.includes('SKILL.md')) {
      return yield* Effect.fail(new Error(`'${dir}' has no SKILL.md`));
    }
    const files: Record<string, string> = {};
    for (const entry of names) {
      files[entry] = yield* fs.readFileString(path.join(dir, entry));
    }
    return { files, source: dir } satisfies ResolvedSkill;
  });

  return fromDisk.pipe(
    Effect.catch((cause) => {
      const embedded = EMBEDDED_SKILL_PAYLOAD[name];
      return embedded === undefined
        ? Effect.fail(
            doctorError({
              code: 'doctor.payload',
              path: dir,
              operation: 'readDirectory',
              problem: `packaged skill '${name}' is not readable at '${dir}' and is not embedded in this build`,
              cause,
              fix: 'Reinstall @montflow/specs, or restore packages/specs/skills.',
            }),
          )
        : Effect.succeed({ files: embedded, source: 'embedded in this build' });
    }),
  );
};

/** Schema doctor requires a canonical prompt file to decode as. */
const PromptFile = Schema.fromJsonString(
  Schema.Struct({
    name: Schema.String,
    description: Schema.String,
    template: Schema.String,
    variables: Schema.Array(Schema.Unknown),
    skills: Schema.Array(Schema.String),
    model: Schema.String,
  }),
);

/** Lowercase, hyphen-separated prompt slug. */
const PROMPT_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Decode and check one prompt file before it is copied anywhere.
 * @param name - expected prompt name (the file stem)
 * @param text - raw JSON bytes
 * @returns undefined when valid, else a problem sentence starting with a verb
 */
export const promptProblem = (name: string, text: string): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    const decoded = yield* Schema.decodeUnknownEffect(PromptFile)(text).pipe(Effect.result);
    if (Result.isFailure(decoded)) {
      return `is not valid prompt JSON (${decoded.failure.message})`;
    }
    const prompt = decoded.success;
    if (prompt.name !== name) {
      return `declares name '${prompt.name}', expected '${name}'`;
    }
    if (!PROMPT_NAME_PATTERN.test(prompt.name)) {
      return `uses a non-slug name '${prompt.name}'`;
    }
    if (prompt.description.trim() === '') return 'has an empty "description"';
    if (prompt.template.trim() === '') return 'has an empty "template"';
    return undefined;
  });

/**
 * Failure when an install directory exists but is not a directory, or cannot be
 * statted. Reported against the directory itself, not the file doctor would
 * have written inside it.
 * @param fs - filesystem service
 * @param dir - directory the payloads are installed under
 * @returns undefined when a directory or nothing is there, else the failure
 */
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
      fix: `Remove '${dir}' and re-run mf-specs doctor.`,
    });
  });

/** An installed prompt file, described without following links. */
type InstalledPrompt =
  | { readonly kind: 'absent' }
  | { readonly kind: 'symlink'; readonly link: string }
  | { readonly kind: 'file'; readonly text: string }
  /** Readable path, unreadable file: repair may still replace it atomically. */
  | { readonly kind: 'unreadable'; readonly failure: DoctorError }
  /** Not a file (directory, device): repair must not overwrite it. */
  | { readonly kind: 'unusable'; readonly failure: DoctorError };

/** Read the installed prompt without ever following a symbolic link. */
const readInstalledPrompt = (
  fs: FileSystem.FileSystem,
  target: string,
): Effect.Effect<InstalledPrompt> =>
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
          fix: `Move '${target}' out of the way and re-run mf-specs doctor.`,
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
          fix: `Make '${target}' readable, or re-run mf-specs doctor to replace it.`,
        }),
      };
    }
    return { kind: 'file', text: read.success };
  });

/** An installed skill directory, described without following links. */
type InstalledSkill =
  | { readonly kind: 'absent' }
  | { readonly kind: 'symlink'; readonly link: string }
  | { readonly kind: 'unusable'; readonly failure: DoctorError }
  | {
      readonly kind: 'directory';
      readonly names: ReadonlyArray<string>;
      readonly files: Readonly<Record<string, string>>;
      /** Read failures, keyed by entry name, so extras never count as drift. */
      readonly failures: Readonly<Record<string, DoctorError>>;
    };

/** Read the installed skill directory without ever following a symbolic link. */
const readInstalledSkill = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
): Effect.Effect<InstalledSkill> =>
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
          problem: `installed skill path '${target}' is a ${info.success.type.toLowerCase()}, not a directory`,
          fix: `Move '${target}' out of the way and re-run mf-specs doctor.`,
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
          fix: `Make '${target}' readable, or remove it and re-run mf-specs doctor.`,
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
          fix: `Make '${file}' readable, or re-run mf-specs doctor to replace it.`,
        });
      }
    }
    return { kind: 'directory', names, files, failures };
  });

/** How the installed copy differs from the payload, if it does. */
interface SkillDifference {
  /** Why a file the package ships differs; undefined when they all match. */
  readonly drift?: string;
  /** Coded failure behind an unreadable file the package ships. */
  readonly failure?: DoctorError;
  /** Installed files the package does not ship; doctor never removes them. */
  readonly extras: ReadonlyArray<string>;
}

/**
 * Compare the payload against the installed copy, naming the exact difference.
 *
 * Only files the package ships count as drift: a file doctor did not install is
 * user data, so its presence never makes the payload stale and repair leaves it
 * in place.
 */
const compareSkill = (
  expected: Readonly<Record<string, string>>,
  installed: {
    readonly names: ReadonlyArray<string>;
    readonly files: Readonly<Record<string, string>>;
    readonly failures: Readonly<Record<string, DoctorError>>;
  },
): SkillDifference => {
  const want = Object.keys(expected).toSorted();
  const extra = installed.names.filter((entry) => !want.includes(entry));
  const missing = want.filter((entry) => !installed.names.includes(entry));
  const unreadable = want
    .map((entry) => installed.failures[entry])
    .find((failure) => failure !== undefined);

  if (missing.length > 0) {
    return { drift: `installed copy is missing: ${missing.join(', ')}`, extras: extra };
  }
  if (unreadable !== undefined) {
    return { drift: unreadable.problem, failure: unreadable, extras: extra };
  }
  const differing = want.find((entry) => expected[entry] !== installed.files[entry]);
  if (differing !== undefined) {
    return { drift: `'${differing}' differs from the package`, extras: extra };
  }
  return { extras: extra };
};

/** Name the installed files doctor does not own, which it leaves untouched. */
const extrasNote = (extras: ReadonlyArray<string>): string =>
  extras.length === 0 ? '' : `; kept extra files the package does not ship: ${extras.join(', ')}`;

/** Writes left in the target directory, named uniquely per process and call. */
let tempWriteCounter = 0;

/**
 * Write one file atomically: a sibling temp file, then `rename`.
 *
 * `rename` replaces the destination entry itself, so it never follows a
 * symlink and never writes through one, and it works over an unreadable file
 * because the write needs only directory permission.
 * @param fs - filesystem service
 * @param path - path service
 * @param target - destination file
 * @param text - bytes to write
 * @returns success, or a `doctor.write` failure naming the destination
 */
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
          fix: `Remove '${target}' or its parent entry and re-run mf-specs doctor.`,
        }),
      );
    }
  });
};

/** Outcome fields every install branch shares. */
interface InstallIdentity {
  readonly name: string;
  readonly source: string;
  readonly target: string;
}

/** Build a `blocked` payload, keeping the coded failure. */
const blocked = (identity: InstallIdentity, failure: DoctorError): PayloadInstall => ({
  name: identity.name,
  status: 'blocked',
  source: identity.source,
  target: identity.target,
  detail: failure.problem,
  failure,
});

/** A payload being filled in, so absent optional fields stay absent. */
interface MutablePayloadInstall {
  name: string;
  status: PayloadInstall['status'];
  source: string;
  target: string;
  detail?: string;
  failure?: DoctorError;
}

/** Build a `stale` payload, keeping a coded failure when one applies. */
const stale = (
  identity: InstallIdentity,
  detail: string,
  failure?: DoctorError,
): PayloadInstall => {
  const built: MutablePayloadInstall = {
    name: identity.name,
    status: 'stale',
    source: identity.source,
    target: identity.target,
    detail,
  };
  if (failure !== undefined) built.failure = failure;
  return built;
};

/**
 * Check `<root>/.agents/@montflow/prompts/<name>.json` against the packaged
 * prompt. In repair mode a missing prompt is written, a stale one is replaced
 * with the package bytes, and a symlink is replaced by a regular file; a
 * current one is left untouched. In check mode nothing is written and the
 * result reports `ok` / `missing` / `stale` / `blocked`. An obstruction repair
 * cannot clear — an invalid package prompt, a file where the directory belongs,
 * or an entry that is not a regular file — is `blocked` in both modes, so the
 * report never advertises a repair that cannot work.
 * @param root - repo root that owns `.agents/@montflow/prompts/`
 * @param name - prompt name without the `.json` extension
 * @param options - set `check` to report without writing
 * @returns the prompt outcome with source and target paths
 */
const installPrompt = (
  root: string,
  name: string,
  options: DoctorOptions,
): Effect.Effect<PromptInstall> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = installedPromptFile(path, root, name);
    const check = options.check === true;

    const packaged = yield* readPackagedPrompt(fs, path, name).pipe(Effect.result);
    if (Result.isFailure(packaged)) {
      return blocked({ name, source: shippedPromptFile(path, name), target }, packaged.failure);
    }
    const { text: want, source } = packaged.success;
    const identity: InstallIdentity = { name, source, target };
    const dir = installedPromptDir(path, root);

    const dirFailure = yield* installDirFailure(fs, dir);
    if (dirFailure !== undefined) return blocked(identity, dirFailure);

    const problem = yield* promptProblem(name, want);
    if (problem !== undefined) {
      return blocked(
        identity,
        doctorError({
          code: 'doctor.invalid',
          path: source,
          operation: 'validate',
          problem: `packaged prompt '${name}' ${problem}`,
          fix: `Fix '${source}' so it decodes as a prompt, then re-run mf-specs doctor.`,
        }),
      );
    }

    const installed = yield* readInstalledPrompt(fs, target);

    if (installed.kind === 'file' && installed.text === want) {
      return {
        name,
        status: check ? ('ok' as const) : ('present' as const),
        source,
        target,
        detail: 'up to date',
      };
    }

    const detail = Match.value(installed).pipe(
      Match.discriminatorsExhaustive('kind')({
        file: () => `'${path.basename(target)}' differs from the package`,
        symlink: (copy) =>
          `installed copy is a symbolic link to '${copy.link}'; doctor will replace the link`,
        absent: () => `not installed at '${target}'`,
        unreadable: (copy) => copy.failure.problem,
        unusable: (copy) => copy.failure.problem,
      }),
    );

    if (check) {
      return Match.value(installed).pipe(
        Match.discriminatorsExhaustive('kind')({
          absent: () => ({ name, status: 'missing' as const, source, target, detail }),
          file: () => stale(identity, detail),
          symlink: () => stale(identity, detail),
          unreadable: (copy) => stale(identity, detail, copy.failure),
          unusable: (copy) => blocked(identity, copy.failure),
        }),
      );
    }

    const write = (status: 'installed' | 'repaired', after: string): Effect.Effect<PromptInstall> =>
      Effect.gen(function* () {
        const created = yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.result);
        if (Result.isFailure(created)) {
          return blocked(
            identity,
            doctorError({
              code: 'doctor.create',
              path: dir,
              operation: 'makeDirectory',
              problem: `cannot create '${dir}': ${reasonOf(created.failure)}`,
              cause: created.failure,
              fix: `Remove the file at '${dir}' (or fix its permissions) and re-run mf-specs doctor.`,
            }),
          );
        }
        const wrote = yield* writeAtomically(fs, path, target, want).pipe(Effect.result);
        if (Result.isFailure(wrote)) return blocked(identity, wrote.failure);
        return { name, status, source, target, detail: after };
      });

    return yield* Match.value(installed).pipe(
      Match.discriminatorsExhaustive('kind')({
        absent: () => write('installed', `not installed at '${target}'`),
        file: () => write('repaired', `'${path.basename(target)}' differed from the package`),
        symlink: (copy) => write('repaired', `replaced the symbolic link to '${copy.link}'`),
        unreadable: (copy) =>
          write('repaired', `replaced the unreadable copy (${copy.failure.problem})`),
        unusable: (copy) => Effect.succeed(blocked(identity, copy.failure)),
      }),
    );
  }).pipe(Effect.provide(NodeLive));

/** Coded refusal for a symlinked skill directory: doctor never writes through a link. */
const skillSymlinkFailure = (target: string, link: string): DoctorError =>
  doctorError({
    code: 'doctor.symlink',
    path: target,
    operation: 'rename',
    problem: `installed skill '${target}' is a symbolic link to '${link}'; doctor will not write through it`,
    fix: `Remove the symlink '${target}' and re-run mf-specs doctor.`,
  });

/**
 * Check `<root>/.agents/skills/<name>` against the packaged skill. In repair
 * mode a missing skill is copied in and a stale or partial one is rewritten
 * from the payload, touching only the files the package ships: any file doctor
 * did not install is left in place and named in the report. A current copy is
 * never rewritten, and extra files alone never make it stale, so a repair run
 * converges. In check mode nothing is written and the result reports `ok` /
 * `missing` / `stale` / `blocked`. Conditions repair refuses — a symlinked
 * directory, an entry that is not a directory, an unreadable directory — are
 * `blocked` in both modes with a coded failure and its fix.
 * @param root - repo root that owns `.agents/skills/`
 * @param name - skill name
 * @param options - set `check` to report without writing
 * @returns the skill outcome with source and target paths
 */
const installSkill = (
  root: string,
  name: string,
  options: DoctorOptions,
): Effect.Effect<SkillInstall> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const target = installedSkillDir(path, root, name);
    const check = options.check === true;

    const packaged = yield* readPackagedSkill(fs, path, name).pipe(Effect.result);
    if (Result.isFailure(packaged)) {
      return blocked({ name, source: shippedSkillDir(path, name), target }, packaged.failure);
    }
    const { files, source } = packaged.success;
    const identity: InstallIdentity = { name, source, target };
    const dir = path.dirname(target);

    const dirFailure = yield* installDirFailure(fs, dir);
    if (dirFailure !== undefined) return blocked(identity, dirFailure);

    const installed = yield* readInstalledSkill(fs, path, target);

    if (check) {
      return Match.value(installed).pipe(
        Match.discriminatorsExhaustive('kind')({
          absent: () => ({
            name,
            status: 'missing' as const,
            source,
            target,
            detail: `not installed at '${target}'`,
          }),
          symlink: (copy) => blocked(identity, skillSymlinkFailure(target, copy.link)),
          unusable: (copy) => blocked(identity, copy.failure),
          directory: (copy) => {
            const difference = compareSkill(files, copy);
            return difference.drift === undefined
              ? {
                  name,
                  status: 'ok' as const,
                  source,
                  target,
                  detail: `up to date${extrasNote(difference.extras)}`,
                }
              : stale(
                  identity,
                  `${difference.drift}${extrasNote(difference.extras)}`,
                  difference.failure,
                );
          },
        }),
      );
    }

    const write = (
      status: 'installed' | 'repaired',
      describe: (written: ReadonlyArray<string>) => string,
    ): Effect.Effect<SkillInstall> =>
      Effect.gen(function* () {
        const createdDir = yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.result);
        if (Result.isFailure(createdDir)) {
          return blocked(
            identity,
            doctorError({
              code: 'doctor.create',
              path: dir,
              operation: 'makeDirectory',
              problem: `cannot create '${dir}': ${reasonOf(createdDir.failure)}`,
              cause: createdDir.failure,
              fix: `Remove the file at '${dir}' (or fix its permissions) and re-run mf-specs doctor.`,
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
              fix: `Remove the entry at '${target}' (or fix its permissions) and re-run mf-specs doctor.`,
            }),
          );
        }

        const written: Array<string> = [];
        for (const [entry, text] of Object.entries(files)) {
          const file = path.join(target, entry);
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
          written.push(entry);
        }

        return { name, status, source, target, detail: describe(written) };
      });

    return yield* Match.value(installed).pipe(
      Match.discriminatorsExhaustive('kind')({
        absent: () => write('installed', (written) => `installed ${written.join(', ')}`),
        symlink: (copy) =>
          Effect.succeed(blocked(identity, skillSymlinkFailure(target, copy.link))),
        unusable: (copy) => Effect.succeed(blocked(identity, copy.failure)),
        directory: (copy) => {
          const difference = compareSkill(files, copy);
          if (difference.drift === undefined) {
            return Effect.succeed({
              name,
              status: 'present' as const,
              source,
              target,
              detail: `up to date${extrasNote(difference.extras)}`,
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

/** Statuses that mean "not usable until doctor repairs them". */
const unhealthyStatus = (status: PayloadInstall['status']): boolean =>
  status === 'missing' || status === 'stale' || status === 'blocked';

/**
 * True when a plain `doctor` run can repair the payload at this status.
 * `blocked` is excluded by construction: every condition repair refuses —
 * symlink, obstruction, invalid package prompt, unreadable directory — is
 * classified `blocked` in check mode too, so the repair hint is never printed
 * for work `doctor` cannot do.
 */
export const repairableStatus = (status: PayloadInstall['status']): boolean =>
  status === 'missing' || status === 'stale';

/**
 * Check every packaged skill under `<root>/.agents/skills/` and every packaged
 * prompt under `<root>/.agents/@montflow/prompts/`. In repair mode missing
 * payloads are written and stale or partial ones are rewritten; in check mode
 * nothing is written. One payload's failure never aborts the others: it becomes
 * a `blocked` outcome carrying the coded cause.
 * @param root - repo root that owns `.agents/`
 * @param options - set `check` to report without writing
 * @returns one outcome per skill and prompt plus the aggregate status
 */
export const runDoctor = (root: string, options: DoctorOptions = {}): Effect.Effect<DoctorResult> =>
  Effect.gen(function* () {
    const skills = yield* Effect.forEach(SPEC_SKILL_NAMES, (name) =>
      installSkill(root, name, options),
    );
    const prompts = yield* Effect.forEach(SPEC_PROMPT_NAMES, (name) =>
      installPrompt(root, name, options),
    );
    const payloads = [...skills, ...prompts];
    const unhealthy = payloads.some((payload) => unhealthyStatus(payload.status));
    const wrote = payloads.some(
      (payload) => payload.status === 'installed' || payload.status === 'repaired',
    );
    const mode = options.check === true ? ('check' as const) : ('repair' as const);
    const state = Match.value({ unhealthy, wrote }).pipe(
      Match.when({ unhealthy: true }, () => 'unhealthy' as const),
      Match.when({ wrote: true }, () => 'wrote' as const),
      Match.orElse(() => 'current' as const),
    );
    const status = Match.value({ mode, state }).pipe(
      Match.when({ mode: 'check', state: 'unhealthy' }, () => 'drifted' as const),
      Match.when({ mode: 'check', state: 'current' }, () => 'ok' as const),
      Match.when({ mode: 'check', state: 'wrote' }, () => 'ok' as const),
      Match.when({ mode: 'repair', state: 'unhealthy' }, () => 'drifted' as const),
      Match.when({ mode: 'repair', state: 'wrote' }, () => 'installed' as const),
      Match.when({ mode: 'repair', state: 'current' }, () => 'present' as const),
      Match.exhaustive,
    );
    return { status, healthy: !unhealthy, root, skills, prompts };
  });

/**
 * Nearest ancestor of `startDir` containing a `.git` entry, so the payloads
 * always land at the repository root, never a subdirectory. Falls back to
 * `startDir`.
 * @param startDir - directory to search from
 * @returns Effect resolving to the repository root, or `startDir` when none is found
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

/**
 * Resolve the repo root from `startDir`, then check/install the payloads there.
 * @param startDir - directory to resolve the repo root from
 * @param options - set `check` to report without writing
 * @returns one outcome per skill and prompt plus the aggregate status
 */
export const runDoctorAt = (
  startDir: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult> =>
  resolveRepoRoot(startDir).pipe(Effect.flatMap((root) => runDoctor(root, options)));
