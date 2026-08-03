import { Data, Effect, Option } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import {
  REVIEWER_SKILL_PATH,
  FIXER_SKILL_PATH,
  skillPath,
  SKILLS_ROOT,
} from './skill-paths';
import { usesSupervisor, type LoopConfig } from './config';

/** Skill verification failure — missing bundled skills or version floor not met. */
export class SkillVerificationError extends Data.TaggedError('SkillVerificationError')<{
  readonly message: string;
}> {}

/**
 * Extracts the 'version' field from YAML frontmatter (--- delimited).
 * Returns none if no frontmatter or no version field found.
 * @param {string} content The full skill file contents
 * @returns The version string, or none when absent
 */
export const extractVersion = (content: string): Option.Option<string> => {
  // Normalize CRLF → LF so files saved on Windows checkouts still parse.
  const normalized = content.replace(/\r\n/g, '\n');
  const frontmatter = normalized.match(/^---\n([\s\S]*?)\n---/);
  if (!frontmatter) return Option.none();
  const version = (frontmatter[1] ?? '').match(/^version:\s*(.+)$/m);
  const value = version?.[1];
  return value === undefined ? Option.none() : Option.some(value.trim());
};

/**
 * Compares two semver strings by major version only.
 * Returns true when `a` >= `b`.
 * @param {string} a The version being checked
 * @param {string} b The minimum required version
 * @returns True when a's major version is at least b's
 */
export const majorGte = (a: string, b: string): boolean => {
  const aMajor = parseInt(a.split('.')[0] ?? '', 10);
  const bMajor = parseInt(b.split('.')[0] ?? '', 10);
  return !isNaN(aMajor) && !isNaN(bMajor) && aMajor >= bMajor;
};

/**
 * Verifies bundled reviewer + fixer skills exist and meet major-version floors.
 * @param {string} [skillsRoot] Skills directory to check (defaults to package skills/)
 * @returns An effect that fails with SkillVerificationError when verification fails
 */
export const verifySkill = (
  skillsRoot: string = SKILLS_ROOT,
): Effect.Effect<void, SkillVerificationError, FileSystem> =>
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem;

    const reviewerPath =
      skillsRoot === SKILLS_ROOT
        ? REVIEWER_SKILL_PATH
        : skillPath(skillsRoot, 'adversarial-review');
    const fixerPath =
      skillsRoot === SKILLS_ROOT
        ? FIXER_SKILL_PATH
        : skillPath(skillsRoot, 'addressing-adversarial-review');

    const reviewerExists = yield* fileSystem
      .exists(reviewerPath)
      .pipe(Effect.orElseSucceed(() => false));
    const fixerExists = yield* fileSystem
      .exists(fixerPath)
      .pipe(Effect.orElseSucceed(() => false));

    if (!reviewerExists || !fixerExists) {
      return yield* Effect.fail(
        new SkillVerificationError({
          message:
            `Required bundled skills not found at ${reviewerPath} or ${fixerPath}. ` +
            'The extension package is missing its skills/ directory.',
        }),
      );
    }

    const skillContent = yield* fileSystem.readFileString(reviewerPath, 'utf8').pipe(
      Effect.mapError(
        (cause) =>
          new SkillVerificationError({
            message: `Failed to read ${reviewerPath}: ${cause.message}`,
          }),
      ),
    );
    const fixerContent = yield* fileSystem.readFileString(fixerPath, 'utf8').pipe(
      Effect.mapError(
        (cause) =>
          new SkillVerificationError({
            message: `Failed to read ${fixerPath}: ${cause.message}`,
          }),
      ),
    );

    const skillVersion = extractVersion(skillContent);
    const fixerVersion = extractVersion(fixerContent);

    const issues: string[] = [];
    if (Option.isNone(skillVersion)) {
      issues.push('adversarial-review skill is missing version frontmatter — cannot enforce major-version floor');
    } else if (!majorGte(skillVersion.value, '3.0.0')) {
      issues.push(
        `adversarial-review skill version ${skillVersion.value} < 3.0.0 — update required`,
      );
    }
    if (Option.isNone(fixerVersion)) {
      issues.push('addressing-adversarial-review skill is missing version frontmatter — cannot enforce major-version floor');
    } else if (!majorGte(fixerVersion.value, '1.0.0')) {
      issues.push(
        `addressing-adversarial-review skill version ${fixerVersion.value} < 1.0.0 — update required`,
      );
    }

    if (issues.length > 0) {
      return yield* Effect.fail(
        new SkillVerificationError({
          message: `Version incompatibilities:\n  - ${issues.join('\n  - ')}`,
        }),
      );
    }
  });

/**
 * Verifies every skill the resolved config can dispatch: the core reviewer +
 * fixer skills (with version floors), plus each reviewer's effective
 * skillPath, the supervisor skill (when the supervisor runs), and the
 * reconciliator skill (when reconciliator mode is not 'never'). Extra paths
 * are existence-checked only — version floors apply to the two core skills.
 * @param {LoopConfig} config The resolved loop configuration
 * @returns An effect that fails with SkillVerificationError when any required skill is missing
 */
export const verifyLoopSkills = (
  config: LoopConfig,
): Effect.Effect<void, SkillVerificationError, FileSystem> =>
  Effect.gen(function* () {
    yield* verifySkill();
    const fileSystem = yield* FileSystem;

    const extra = new Set<string>();
    for (const profile of config.reviewers) extra.add(profile.skillPath);
    if (usesSupervisor(config)) extra.add(config.supervisor.skillPath);
    if (config.reconciliator.mode !== 'never') extra.add(config.reconciliator.skillPath);
    extra.delete(REVIEWER_SKILL_PATH);
    extra.delete(FIXER_SKILL_PATH);
    extra.delete('');

    const missing: string[] = [];
    for (const path of extra) {
      const exists = yield* fileSystem.exists(path).pipe(Effect.orElseSucceed(() => false));
      if (!exists) missing.push(path);
    }
    if (missing.length > 0) {
      return yield* Effect.fail(
        new SkillVerificationError({
          message:
            `Skill files referenced by the resolved config were not found:\n  - ${missing.join('\n  - ')}`,
        }),
      );
    }
  });
