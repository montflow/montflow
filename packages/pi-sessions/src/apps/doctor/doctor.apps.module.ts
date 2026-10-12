import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, FileSystem, Layer, Path } from 'effect';

/**
 * `mf-sessions doctor`: check and install the dispatch skill the CLI and Pi
 * extension need to teach an agent how to dispatch sessions.
 */

/** Skill shipped with the package and installed into a repo. */
export const SESSION_SKILL_NAME = 'montflow-dispatch-pi-sessions';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Directory the package ships the dispatch skill in. */
const shippedSkillDir = (path: Path.Path): string =>
  path.join(path.resolve(import.meta.dirname, '..', '..', '..'), 'skills', SESSION_SKILL_NAME);

/** Directory `doctor` installs the dispatch skill into. */
export const installedSkillDir = (path: Path.Path, root: string): string =>
  path.join(root, '.agents', 'skills', SESSION_SKILL_NAME);

const reasonOf = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

/** Outcome of a doctor check. */
export interface DoctorResult {
  readonly status: 'present' | 'installed' | 'missing';
  readonly source: string;
  readonly target: string;
}

/** Per-check controls. */
export interface DoctorOptions {
  /** Report only: never write, and report `missing` when the skill is absent. */
  readonly check?: boolean;
}

/**
 * Check `<root>/.agents/skills/montflow-dispatch-pi-sessions` and copy the skill
 * from the package payload when it is missing. Idempotent: an installed skill
 * is left untouched. With `check`, nothing is written and a missing skill
 * reports `missing` rather than being installed.
 * @param root - repo root that owns `.agents/skills/`
 * @param options - report-only controls
 * @returns the outcome plus source and target directories
 */
export const doctor = (
  root: string,
  options: DoctorOptions = {},
): Effect.Effect<DoctorResult, string> =>
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
        `doctor: packaged skill '${SESSION_SKILL_NAME}' is missing at '${source}'`,
      );
    }

    if (yield* exists(path.join(target, 'SKILL.md'))) {
      return { status: 'present' as const, source, target };
    }

    if (options.check === true) {
      return { status: 'missing' as const, source, target };
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
