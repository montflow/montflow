import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';
import { EMBEDDED_SKILL_PAYLOAD } from './embedded-payload.generated.js';

/**
 * `mf-prompts doctor` — the binary, and the `/mf-prompts` slash command of
 * the same name: check `<root>/.agents/skills/` against the skills this
 * package ships, and repair what it can.
 *
 * Two things are checked per skill, not one. *Presence* — is it installed at
 * all — was the original behaviour and is the obvious failure. *Freshness* —
 * do its bytes still match the package — matters just as much, because a stale
 * `SKILL.md` teaches an agent rules the verifier no longer enforces, which
 * fails later and further from the cause.
 *
 * `execute` gates on this, so a drifted or absent skill surfaces as a short
 * error before an agent acts on outdated guidance.
 */

/** Skills shipped with the package and installed into a repo. */
export const SKILL_NAMES = ['montflow-create-pi-prompts', 'montflow-execute-pi-prompts'] as const;

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Directory the package ships its skills in. Absent in a compiled binary. */
export const shippedSkillsDir = (path: Path.Path): string =>
  path.join(path.resolve(import.meta.dirname, '..', '..', '..'), 'skills');

/** Directory `doctor` installs one skill into. */
export const installedSkillDir = (path: Path.Path, root: string, name: string): string =>
  path.join(root, '.agents', 'skills', name);

/**
 * A skill's packaged files, as filename → contents.
 *
 * In memory rather than a directory path, because the payload has two possible
 * sources — the package on disk, or the bundle — and only the first is a
 * directory.
 */
export type SkillPayload = Readonly<Record<string, string>>;

/** Where a resolved payload came from. */
export type PayloadOrigin = 'package' | 'embedded';

/** A skill's payload plus provenance, for the report. */
export interface ResolvedPayload {
  readonly files: SkillPayload;
  readonly origin: PayloadOrigin;
  /** Human-readable location shown in the status line. */
  readonly source: string;
}

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Outcome for one shipped skill. */
export interface SkillStatus {
  readonly name: string;
  /**
   * `ok` — installed and byte-identical to the package.
   * `missing` — not installed.
   * `stale` — installed, but the contents differ from the package.
   * `repaired` / `installed` — doctor rewrote the copy.
   * `mismatched` — installed with a different *set* of files than the package.
   */
  readonly status: 'ok' | 'missing' | 'stale' | 'installed' | 'repaired' | 'mismatched';
  readonly source: string;
  readonly target: string;
  /** One-line explanation of what differed, for `stale` / `mismatched`. */
  readonly detail: string;
}

/** Outcome of a doctor run across every shipped skill. */
export interface DoctorResult {
  /**
   * `ok` when every skill is installed and current.
   * `repaired` when doctor fixed at least one.
   * `drifted` in `check` mode when something needed fixing but nothing was
   * written.
   */
  readonly status: 'ok' | 'repaired' | 'drifted';
  /** True when nothing is wrong, whether or not doctor had to fix it. */
  readonly healthy: boolean;
  readonly skills: ReadonlyArray<SkillStatus>;
  /** One-line summary, and the whole explanation when unhealthy. */
  readonly message: string;
}

/** How to run: repair what can be repaired, or only report. */
export interface DoctorOptions {
  /**
   * Report only — never write. Used by `execute` to ask "are the skills
   * usable?" without mutating the repo mid-run, and by `doctor --check` when
   * a human wants a read-only answer.
   */
  readonly check?: boolean;
  /**
   * How the caller reaches `doctor`, used in the report's fix line so the
   * advice is typeable. The binary passes `mf-prompts doctor`; the slash
   * command keeps the default.
   */
  readonly invocation?: string | undefined;
}

/** The default way a caller reaches `doctor` when it does not say. */
export const DEFAULT_DOCTOR_INVOCATION = '/mf-prompts doctor';

/** One file's contents, or undefined when it is absent. */
const readIfPresent = (
  fs: FileSystem.FileSystem,
  file: string,
): Effect.Effect<string | undefined, string> =>
  fs.readFileString(file).pipe(
    Effect.map((text) => text),
    Effect.orElseSucceed(() => undefined),
  );

/** Sorted file names directly under a directory; empty when it cannot be read. */
const listFiles = (
  fs: FileSystem.FileSystem,
  dir: string,
): Effect.Effect<ReadonlyArray<string>, string> =>
  fs.readDirectory(dir).pipe(
    Effect.mapError((cause) => `doctor: cannot read '${dir}': ${reasonOf(cause)}`),
    // SAFETY: an unreadable directory is a missing install, not a doctor
    // failure — the caller reports it as `missing` and can still install.
    Effect.orElseSucceed(() => [] as ReadonlyArray<string>),
  );

/** True when two file-name lists describe the same set. */
const sameFiles = (a: ReadonlyArray<string>, b: ReadonlyArray<string>): boolean =>
  a.length === b.length && a.every((name, index) => name === b[index]);

/** Read a skill's files from a directory on disk, keyed by file name. */
const readFromPackage = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  dir: string,
): Effect.Effect<SkillPayload | undefined> =>
  Effect.gen(function* () {
    const names = (yield* listFiles(fs, dir)).filter((name) => !name.startsWith('.')).toSorted();
    if (!names.includes('SKILL.md')) return undefined;
    const files: Record<string, string> = {};
    for (const name of names) {
      const text = yield* readIfPresent(fs, path.join(dir, name));
      if (text === undefined) return undefined;
      files[name] = text;
    }
    return files;
  }).pipe(Effect.orDie);

/**
 * Resolve one skill's payload, preferring the package directory.
 *
 * The package wins so that editing a skill in a source checkout takes effect
 * with no regeneration step. The embedded copy — written by
 * `bun run generate:payload` — is the fallback, and the only reason it is needed
 * at all: under `bun build --compile` the package directory does not exist at
 * runtime, so without it the binary could neither repair nor verify the skills,
 * and `execute` would be permanently blocked by its own gate.
 *
 * Returns undefined only when neither source can supply the skill, which is the
 * one case `doctor` cannot paper over.
 * @param fs - filesystem service
 * @param path - path service
 * @param name - skill name
 * @param shippedDir - the package `skills/` directory, which may not exist
 * @returns the payload and its origin, or undefined when it is unavailable
 */
export const readPayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  name: string,
  shippedDir: string,
): Effect.Effect<ResolvedPayload | undefined> =>
  readFromPackage(fs, path, path.join(shippedDir, name)).pipe(
    Effect.map((fromDisk) => {
      if (fromDisk !== undefined) {
        return {
          files: fromDisk,
          origin: 'package',
          source: path.join(shippedDir, name),
        } satisfies ResolvedPayload;
      }
      const embedded = EMBEDDED_SKILL_PAYLOAD[name];
      return embedded === undefined
        ? undefined
        : ({
            files: embedded,
            origin: 'embedded',
            source: 'embedded in this build',
          } satisfies ResolvedPayload);
    }),
  );

/** Write a payload's files into the target directory. */
const writePayload = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  files: SkillPayload,
): Effect.Effect<void, string> =>
  Effect.gen(function* () {
    yield* fs
      .makeDirectory(target, { recursive: true })
      .pipe(Effect.mapError((cause) => `doctor: cannot create '${target}': ${reasonOf(cause)}`));
    for (const [name, text] of Object.entries(files)) {
      const to = path.join(target, name);
      yield* fs
        .writeFileString(to, text)
        .pipe(Effect.mapError((cause) => `doctor: cannot write '${to}': ${reasonOf(cause)}`));
    }
  });

/** Describe the first file whose installed contents differ from the payload. */
const firstDifference = (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  target: string,
  files: SkillPayload,
): Effect.Effect<string | undefined> =>
  Effect.gen(function* () {
    for (const [name, shipped] of Object.entries(files)) {
      const installed = yield* readIfPresent(fs, path.join(target, name));
      if (installed === shipped) continue;
      return installed === undefined
        ? `${name} is missing from the installed copy`
        : `${name} differs from the packaged version`;
    }
    return undefined;
  }).pipe(Effect.orDie);

/**
 * Check every shipped skill under `<root>/.agents/skills/` and, unless
 * `check` is set, rewrite the copies that are missing, stale, or holding a
 * different file set. Idempotent: a current skill is never rewritten.
 * @param root - repo root that owns `.agents/skills/`
 * @param options - set `check` to report without writing
 * @returns per-skill outcomes, the aggregate status, and a one-line message
 */
export const runDoctor = (
  root: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const shipped = shippedSkillsDir(path);
    const check = options.check === true;
    const invocation = options.invocation ?? DEFAULT_DOCTOR_INVOCATION;

    const installSkill = (name: string): Effect.Effect<SkillStatus, string> =>
      Effect.gen(function* () {
        const target = installedSkillDir(path, root, name);
        const payload = yield* readPayload(fs, path, name, shipped);
        if (payload === undefined) {
          return yield* Effect.fail(
            `doctor: packaged skill '${name}' is not available on disk at '${path.join(shipped, name)}' and is not embedded in this build — reinstall @montflow/pi-prompts`,
          );
        }
        const { files } = payload;
        const { source } = payload;
        const names = Object.keys(files).toSorted();
        const installedNames = (yield* listFiles(fs, target))
          .filter((file) => !file.startsWith('.'))
          .toSorted();
        const installed = installedNames.includes('SKILL.md');

        if (installed && sameFiles(names, installedNames)) {
          const detail = yield* firstDifference(fs, path, target, files);
          if (detail === undefined) {
            return { name, status: 'ok' as const, source, target, detail: 'up to date' };
          }
          if (check) {
            return { name, status: 'stale' as const, source, target, detail };
          }
          yield* writePayload(fs, path, target, files);
          return { name, status: 'repaired' as const, source, target, detail };
        }

        if (installed) {
          const extra = installedNames.filter((file) => !names.includes(file));
          const detail =
            extra.length > 0
              ? `installed copy has extra file(s): ${extra.join(', ')}`
              : 'installed copy is missing payload file(s)';
          if (check) return { name, status: 'mismatched' as const, source, target, detail };
          yield* writePayload(fs, path, target, files);
          return { name, status: 'repaired' as const, source, target, detail };
        }

        if (check) {
          return { name, status: 'missing' as const, source, target, detail: 'not installed' };
        }
        yield* writePayload(fs, path, target, files);
        return { name, status: 'installed' as const, source, target, detail: 'not installed' };
      });

    const skills = yield* Effect.forEach(SKILL_NAMES, installSkill);
    const unhealthy = skills.filter((skill) => !usable(skill.status));
    const changed = skills.some((skill) => skill.status !== 'ok' && usable(skill.status));
    const status: DoctorResult['status'] =
      unhealthy.length > 0 ? 'drifted' : changed ? 'repaired' : 'ok';
    const healthy = unhealthy.length === 0;
    return {
      status,
      healthy,
      skills,
      message: doctorMessageFor({ status, healthy, skills }, invocation),
    };
  }).pipe(Effect.provide(NodeLive));

/** Statuses that mean "usable", whether or not doctor just fixed them. */
const usable = (status: SkillStatus['status']): boolean =>
  status === 'ok' || status === 'repaired' || status === 'installed';

/** One line per skill, plus a leading summary when anything needed attention. */
const doctorMessageFor = (
  result: {
    readonly status: DoctorResult['status'];
    readonly healthy: boolean;
    readonly skills: ReadonlyArray<SkillStatus>;
  },
  invocation: string,
): string => {
  const lines = result.skills.map((skill) => {
    const mark = skill.status === 'ok' ? '✓' : usable(skill.status) ? '+' : '✗';
    const note =
      skill.status === 'ok'
        ? 'up to date'
        : skill.status === 'repaired'
          ? `updated (${skill.detail})`
          : skill.status === 'installed'
            ? 'installed'
            : skill.detail;
    return `${mark} ${skill.name}: ${note} → ${skill.target}`;
  });
  if (result.status === 'ok') {
    return ['✓ prompts skills are installed and up to date.', ...lines].join('\n');
  }
  if (result.healthy) return ['+ prompts skills repaired.', ...lines].join('\n');
  return [
    '✗ prompts skills are not usable.',
    ...lines,
    // Not hardcoded: the slash command needs a leading slash and the binary
    // must not have one, so the caller says which it is.
    `Run: ${invocation}`,
  ].join('\n');
};

/**
 * Human-readable doctor summary: one line per skill.
 * @param result - result from {@link runDoctor}
 * @returns newline-joined per-skill lines
 */
export const doctorMessage = (result: DoctorResult): string => result.message;

/**
 * The short message an execution stops on. Deliberately terse: it is a gate,
 * not a report, and the full `doctor` output is one command away.
 * @param result - result from a `check`-mode {@link runDoctor}
 * @param invocation - how the caller reaches `doctor`, so the advice is typeable
 * @returns one or two lines naming what is wrong and the fix
 */
export const doctorGateMessage = (
  result: DoctorResult,
  invocation = DEFAULT_DOCTOR_INVOCATION,
): string => {
  const broken = result.skills.filter((skill) => !usable(skill.status));
  return [
    `Prompts skills are not ready: ${broken.map((skill) => `${skill.name} (${skill.detail})`).join('; ')}.`,
    `Run \`${invocation}\` to repair, then retry.`,
  ].join('\n');
};
