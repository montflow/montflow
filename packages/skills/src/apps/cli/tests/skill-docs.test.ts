import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';
import * as Skill from '../../../modules/skill/index.js';

/**
 * The skills this package ships, mirrored into `.agents/skills/` by `doctor`.
 * They are the only place the package tells an agent how to author a skill, so
 * they are worth mechanical guards: they must satisfy the same verifier the CLI
 * exposes, and the repo mirror must not drift from the package copy.
 */

const PACKAGE_SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'skills',
);

const INSTALLED_SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  '..',
  '.agents',
  'skills',
);

/** Every skill this package ships. */
const SKILL_NAMES = ['montflow-create-pi-skills', 'montflow-modify-pi-skills'] as const;

const read = (dir: string, name: string, file: string): string =>
  readFileSync(resolve(dir, name, file), 'utf8');

Vitest.describe('packaged skills', () => {
  Vitest.it('ships exactly the skills doctor installs', () => {
    Vitest.expect(readdirSync(PACKAGE_SKILLS_DIR).toSorted()).toStrictEqual([...SKILL_NAMES]);
  });

  Vitest.it.each(SKILL_NAMES)('%s: passes its own verifier', (name) => {
    Vitest.expect(
      Skill.verifySkillFile(name, read(PACKAGE_SKILLS_DIR, name, 'SKILL.md')),
    ).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it.each(SKILL_NAMES)('%s: the repo mirror is byte-identical', (name) => {
    for (const file of ['SKILL.md', 'CHANGELOG.md']) {
      Vitest.expect(read(INSTALLED_SKILLS_DIR, name, file)).toBe(
        read(PACKAGE_SKILLS_DIR, name, file),
      );
    }
  });

  Vitest.it.each(SKILL_NAMES)('%s: frontmatter version is the newest changelog entry', (name) => {
    const markdown = read(PACKAGE_SKILLS_DIR, name, 'SKILL.md');
    const version = /^version: (\S+)$/mu.exec(markdown)?.[1];
    Vitest.expect(version).toBeDefined();
    const changelog = read(PACKAGE_SKILLS_DIR, name, 'CHANGELOG.md');
    const newest = /^## \[(\S+)\]/mu.exec(changelog)?.[1];
    Vitest.expect(version).toBe(newest);
  });
});
