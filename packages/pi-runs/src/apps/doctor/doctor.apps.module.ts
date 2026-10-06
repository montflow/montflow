import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';

/**
 * `mf-runs doctor`: check and install the dispatch skill the CLI and Pi
 * extension need to teach an agent how to dispatch runs.
 */

/** Skill shipped with the package and installed into a repo. */
export const RUN_SKILL_NAME = 'montflow-dispatch-pi-runs';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Directory the package ships the dispatch skill in. */
const shippedSkillDir = (path: Path.Path): string =>
  path.join(path.resolve(import.meta.dirname, '..', '..', '..'), 'skills', RUN_SKILL_NAME);

/** Directory `doctor` installs the dispatch skill into. */
export const installedSkillDir = (path: Path.Path, root: string): string =>
  path.join(root, '.agents', 'skills', RUN_SKILL_NAME);

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Outcome of a doctor run. */
export interface DoctorResult {
  readonly status: 'present' | 'installed';
  readonly source: string;
  readonly target: string;
}

/**
 * Check `<root>/.agents/skills/montflow-dispatch-pi-runs` and copy the skill
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
        `doctor: packaged skill '${RUN_SKILL_NAME}' is missing at '${source}'`,
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
