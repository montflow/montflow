import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';

/**
 * `mf-features doctor`: install the feature-creation skill an agent needs to
 * author feature specs.
 */

/** Skill shipped with the package and installed into a repo. */
export const CREATE_FEATURE_SKILL_NAME = 'montflow-create-pi-features';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Directory the package ships the creation skill in. */
const shippedSkillDir = (path: Path.Path): string =>
  path.join(
    path.resolve(import.meta.dirname, '..', '..', '..'),
    'skills',
    CREATE_FEATURE_SKILL_NAME,
  );

/** Directory `doctor` installs the creation skill into. */
export const installedSkillDir = (path: Path.Path, root: string): string =>
  path.join(root, '.agents', 'skills', CREATE_FEATURE_SKILL_NAME);

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Outcome of a doctor run. */
export interface DoctorResult {
  readonly status: 'present' | 'installed';
  readonly source: string;
  readonly target: string;
}

/**
 * Check `<root>/.agents/skills/montflow-create-pi-features` and copy the skill
 * from the package payload when it is missing. Idempotent: an installed skill
 * is left untouched.
 * @param root - repo root that owns `.agents/skills/`
 * @returns the outcome plus source and target directories
 */
export const runDoctor = (root: string): Effect.Effect<DoctorResult, string> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const source = shippedSkillDir(path);
    const target = installedSkillDir(path, root);

    const exists = (file: string): Effect.Effect<boolean> =>
      fs.exists(file).pipe(Effect.orElseSucceed(() => false));

    const sourceFile = path.join(source, 'SKILL.md');
    if (!(yield* exists(sourceFile))) {
      return yield* Effect.fail(
        `doctor: packaged skill '${CREATE_FEATURE_SKILL_NAME}' is missing at '${source}'`,
      );
    }

    if (yield* exists(path.join(target, 'SKILL.md'))) {
      return { status: 'present' as const, source, target };
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
    return { status: 'installed' as const, source, target };
  }).pipe(Effect.provide(NodeLive));

/**
 * Nearest ancestor of `startDir` containing a `.git` entry, so the skill always
 * lands at the repository root, never a subdirectory. Falls back to `startDir`.
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
 * Resolve the repo root from `startDir`, then check/install the skill there.
 * @param startDir - directory to resolve the repo root from
 * @returns the outcome plus source and target directories
 */
export const runDoctorAt = (startDir: string): Effect.Effect<DoctorResult, string> =>
  resolveRepoRoot(startDir).pipe(Effect.flatMap(runDoctor));
