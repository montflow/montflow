import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';

/**
 * `mf-specs doctor`: install the spec skills an agent needs to author
 * and discover specs.
 */

/** Skills shipped with the package and installed into a repo. */
export const SPEC_SKILL_NAMES = ['montflow-create-pi-specs', 'montflow-find-pi-specs'] as const;

/** The spec-creation skill name. */
export const CREATE_SPEC_SKILL_NAME = SPEC_SKILL_NAMES[0];

/** The spec-discovery skill name. */
export const FIND_SPECS_SKILL_NAME = SPEC_SKILL_NAMES[1];

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Directory the package ships a skill in. */
const shippedSkillDir = (path: Path.Path, name: string): string =>
  path.join(path.resolve(import.meta.dirname, '..', '..', '..'), 'skills', name);

/** Directory `doctor` installs one skill into. */
export const installedSkillDir = (path: Path.Path, root: string, name: string): string =>
  path.join(root, '.agents', 'skills', name);

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Outcome for one shipped skill. */
export interface SkillInstall {
  readonly name: string;
  /**
   * `ok` — installed and byte-identical to the package (check mode).
   * `missing` — not installed (check mode).
   * `stale` — installed, but a file differs from the package (check mode).
   * `present` — already installed (repair mode).
   * `installed` — doctor just copied it in.
   */
  readonly status: 'ok' | 'missing' | 'stale' | 'present' | 'installed';
  readonly source: string;
  readonly target: string;
  /** One-line explanation of what differed, for `stale` / `missing`. */
  readonly detail?: string;
}

/** Outcome of a doctor run across every shipped skill. */
export interface DoctorResult {
  /**
   * `installed` when at least one skill was copied in.
   * `drifted` in `check` mode when a skill is missing or stale.
   * `ok` in `check` mode when every skill is installed and current.
   * `present` when every skill was already installed and nothing was written.
   */
  readonly status: 'ok' | 'present' | 'installed' | 'drifted';
  /** True when nothing is wrong, whether or not doctor had to fix it. */
  readonly healthy: boolean;
  /** Repo root the skills live under. */
  readonly root: string;
  /** One entry per shipped skill, in {@link SPEC_SKILL_NAMES} order. */
  readonly skills: ReadonlyArray<SkillInstall>;
}

/** How to run: copy missing skills in, or only report. */
export interface DoctorOptions {
  /** Report only — never write. */
  readonly check?: boolean;
}

/** Sorted file names directly under a directory; empty when it cannot be read. */
const listFiles = (path: Path.Path, dir: string): Effect.Effect<ReadonlyArray<string>, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    return yield* fs.readDirectory(dir).pipe(
      Effect.map((entries) => entries.toSorted()),
      Effect.mapError((cause) => `doctor: cannot read '${dir}': ${reasonOf(cause)}`),
    );
  }).pipe(Effect.provide(NodeLive));

/**
 * Compare an installed skill against the packaged one, byte for byte.
 * @param source - packaged skill directory
 * @param target - installed skill directory
 * @returns undefined when identical, else a one-line reason
 */
const diffSkill = (
  path: Path.Path,
  source: string,
  target: string,
): Effect.Effect<string | undefined, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const expected = yield* listFiles(path, source);
    const actual = yield* listFiles(path, target);
    if (expected.join('\n') !== actual.join('\n')) {
      return `installed files differ (${actual.join(', ') || 'none'})`;
    }
    for (const entry of expected) {
      const want = yield* fs
        .readFileString(path.join(source, entry))
        .pipe(Effect.mapError((cause) => `doctor: cannot read '${source}': ${reasonOf(cause)}`));
      const got = yield* fs
        .readFileString(path.join(target, entry))
        .pipe(Effect.mapError((cause) => `doctor: cannot read '${target}': ${reasonOf(cause)}`));
      if (want !== got) return `'${entry}' differs from the package`;
    }
    return undefined;
  }).pipe(Effect.provide(NodeLive));

/**
 * Check `<root>/.agents/skills/<name>` against the packaged skill. In repair
 * mode a missing skill is copied in and an installed one is left untouched; in
 * check mode nothing is written and the result reports `ok` / `missing` /
 * `stale`.
 */
const installSkill = (
  root: string,
  name: string,
  options: DoctorOptions,
): Effect.Effect<SkillInstall, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = shippedSkillDir(path, name);
    const target = installedSkillDir(path, root, name);
    const check = options.check === true;

    const exists = (file: string): Effect.Effect<boolean> =>
      fs.exists(file).pipe(Effect.orElseSucceed(() => false));

    const sourceFile = path.join(source, 'SKILL.md');
    if (!(yield* exists(sourceFile))) {
      return yield* Effect.fail(`doctor: packaged skill '${name}' is missing at '${source}'`);
    }

    if (yield* exists(path.join(target, 'SKILL.md'))) {
      if (!check) return { name, status: 'present' as const, source, target };
      const detail = yield* diffSkill(path, source, target);
      return detail === undefined
        ? { name, status: 'ok' as const, source, target }
        : { name, status: 'stale' as const, source, target, detail };
    }

    if (check) {
      return {
        name,
        status: 'missing' as const,
        source,
        target,
        detail: `not installed at '${target}'`,
      };
    }

    // An unreadable directory is a missing install, not a doctor failure.
    const entries = yield* fs
      .readDirectory(source)
      .pipe(Effect.orElseSucceed((): ReadonlyArray<string> => []));
    yield* fs
      .makeDirectory(target, { recursive: true })
      .pipe(Effect.mapError((cause) => `doctor: cannot create '${target}': ${reasonOf(cause)}`));
    for (const entry of entries) {
      const from = path.join(source, entry);
      const to = path.join(target, entry);
      const text = yield* fs
        .readFileString(from)
        .pipe(Effect.mapError((cause) => `doctor: cannot read '${from}': ${reasonOf(cause)}`));
      yield* fs
        .writeFileString(to, text)
        .pipe(Effect.mapError((cause) => `doctor: cannot write '${to}': ${reasonOf(cause)}`));
    }
    return { name, status: 'installed' as const, source, target };
  }).pipe(Effect.provide(NodeLive));

/**
 * Check every packaged skill under `<root>/.agents/skills/`. In repair mode the
 * missing ones are copied in and installed ones are left untouched; in check
 * mode nothing is written.
 * @param root - repo root that owns `.agents/skills/`
 * @param options - set `check` to report without writing
 * @returns one outcome per skill plus the aggregate status
 */
export const runDoctor = (
  root: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult, string> =>
  Effect.gen(function* () {
    const skills = yield* Effect.forEach(SPEC_SKILL_NAMES, (name) =>
      installSkill(root, name, options),
    );
    const unhealthy = skills.some(
      (skill) => skill.status === 'missing' || skill.status === 'stale',
    );
    const status =
      options.check === true
        ? unhealthy
          ? ('drifted' as const)
          : ('ok' as const)
        : skills.some((skill) => skill.status === 'installed')
          ? ('installed' as const)
          : ('present' as const);
    return { status, healthy: !unhealthy, root, skills };
  });

/**
 * Nearest ancestor of `startDir` containing a `.git` entry, so the skills
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
 * Resolve the repo root from `startDir`, then check/install the skills there.
 * @param startDir - directory to resolve the repo root from
 * @param options - set `check` to report without writing
 * @returns one outcome per skill plus the aggregate status
 */
export const runDoctorAt = (
  startDir: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult, string> =>
  resolveRepoRoot(startDir).pipe(Effect.flatMap((root) => runDoctor(root, options)));
