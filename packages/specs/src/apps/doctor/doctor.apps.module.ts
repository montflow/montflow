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
  readonly status: 'present' | 'installed';
  readonly source: string;
  readonly target: string;
}

/** Outcome of a doctor run across every shipped skill. */
export interface DoctorResult {
  /** `installed` when at least one skill was copied in, else `present`. */
  readonly status: 'present' | 'installed';
  /** Repo root the skills live under. */
  readonly root: string;
  /** One entry per shipped skill, in {@link SPEC_SKILL_NAMES} order. */
  readonly skills: ReadonlyArray<SkillInstall>;
}

/**
 * Check `<root>/.agents/skills/<name>` and copy the packaged skill in when
 * missing. Idempotent: an installed skill is left untouched.
 */
const installSkill = (root: string, name: string): Effect.Effect<SkillInstall, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = shippedSkillDir(path, name);
    const target = installedSkillDir(path, root, name);

    const exists = (file: string): Effect.Effect<boolean> =>
      fs.exists(file).pipe(Effect.orElseSucceed(() => false));

    const sourceFile = path.join(source, 'SKILL.md');
    if (!(yield* exists(sourceFile))) {
      return yield* Effect.fail(`doctor: packaged skill '${name}' is missing at '${source}'`);
    }

    if (yield* exists(path.join(target, 'SKILL.md'))) {
      return { name, status: 'present' as const, source, target };
    }

    const entries = yield* fs
      .readDirectory(source)
      .pipe(Effect.mapError((cause) => `doctor: cannot read '${source}': ${reasonOf(cause)}`));
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
 * Check every packaged skill under `<root>/.agents/skills/` and copy the ones
 * that are missing. Idempotent: an installed skill is left untouched.
 * @param root - repo root that owns `.agents/skills/`
 * @returns one outcome per skill plus the aggregate status
 */
export const runDoctor = (root: string): Effect.Effect<DoctorResult, string> =>
  Effect.gen(function* () {
    const skills = yield* Effect.forEach(SPEC_SKILL_NAMES, (name) => installSkill(root, name));
    const status = skills.some((skill) => skill.status === 'installed')
      ? ('installed' as const)
      : ('present' as const);
    return { status, root, skills };
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
 * @returns one outcome per skill plus the aggregate status
 */
export const runDoctorAt = (startDir: string): Effect.Effect<DoctorResult, string> =>
  resolveRepoRoot(startDir).pipe(Effect.flatMap(runDoctor));
