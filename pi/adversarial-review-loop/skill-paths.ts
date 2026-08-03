import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));

/** Absolute path to the extension's bundled skills directory. */
export const SKILLS_ROOT = path.join(PACKAGE_ROOT, 'skills');

/** Absolute path to the bundled adversarial-review SKILL.md. */
export const REVIEWER_SKILL_PATH = path.join(
  SKILLS_ROOT,
  'adversarial-review',
  'SKILL.md',
);

/** Absolute path to the bundled addressing-adversarial-review SKILL.md. */
export const FIXER_SKILL_PATH = path.join(
  SKILLS_ROOT,
  'addressing-adversarial-review',
  'SKILL.md',
);

/** Absolute path to the bundled feature-spec SKILL.md (structure reference). */
export const FEATURE_SPEC_SKILL_PATH = path.join(
  SKILLS_ROOT,
  'feature-spec',
  'SKILL.md',
);

/** Absolute path to the bundled reconciliator SKILL.md (conflict-only LLM merge). */
export const RECONCILIATOR_SKILL_PATH = path.join(
  SKILLS_ROOT,
  'adversarial-review-reconcile',
  'SKILL.md',
);

/** Absolute path to the bundled supervisor SKILL.md (brief + aggregate). */
export const SUPERVISOR_SKILL_PATH = path.join(
  SKILLS_ROOT,
  'adversarial-review-supervisor',
  'SKILL.md',
);

/**
 * Resolves a skill SKILL.md path under an arbitrary skills root.
 * @param {string} skillsRoot Absolute path to a skills directory
 * @param {string} skillName Skill directory name
 * @returns The absolute SKILL.md path
 */
export const skillPath = (skillsRoot: string, skillName: string): string =>
  path.join(skillsRoot, skillName, 'SKILL.md');
