import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';
import { SPEC_SKILL_NAMES } from '../../apps/doctor/index.js';
import { REVIEWER_PROFILES_FIELD } from '../../modules/task/index.js';
import { AUTHORING_SPEC, EXECUTING_SPEC } from '../index.js';

/**
 * The specs contract is told to an agent twice: the packaged create-spec skill
 * (`skills/montflow-create-pi-specs/`, mirrored into `.agents/skills/` by
 * `doctor`) and the injected `AUTHORING_SPEC`/`EXECUTING_SPEC` prompts. Both must
 * name the same on-disk field (`REVIEWER_PROFILES_FIELD`) the task verifier
 * enforces, so the instructions cannot drift from the contract.
 */

const PACKAGED_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'skills');

const INSTALLED_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
  '.agents',
  'skills',
);

const read = (dir: string, name: string, file: string): string =>
  readFileSync(resolve(dir, name, file), 'utf8');

Vitest.describe('spec skill drift', () => {
  Vitest.it('the injected authoring skill names the reviewer-profiles field', () => {
    Vitest.expect(AUTHORING_SPEC).toContain(REVIEWER_PROFILES_FIELD);
    Vitest.expect(AUTHORING_SPEC).toContain('effect-reviewer');
  });

  Vitest.it('the injected executing skill names the reviewer-profiles field and phase line', () => {
    Vitest.expect(EXECUTING_SPEC).toContain(REVIEWER_PROFILES_FIELD);
    Vitest.expect(EXECUTING_SPEC).toContain('- Phase:');
  });

  Vitest.it('the packaged create-spec skill names the reviewer-profiles field', () => {
    const body = read(PACKAGED_DIR, 'montflow-create-pi-specs', 'SKILL.md');
    Vitest.expect(body).toContain(REVIEWER_PROFILES_FIELD);
    Vitest.expect(body).toContain('effect-reviewer');
    Vitest.expect(body).toContain('--reviewer-profiles');
  });

  Vitest.it.each(SPEC_SKILL_NAMES)('%s: the repo mirror is byte-identical', (name) => {
    for (const file of ['SKILL.md', 'CHANGELOG.md']) {
      Vitest.expect(read(INSTALLED_DIR, name, file)).toBe(read(PACKAGED_DIR, name, file));
    }
  });

  Vitest.it.each(SPEC_SKILL_NAMES)(
    '%s: frontmatter version is the newest changelog entry',
    (name) => {
      const markdown = read(PACKAGED_DIR, name, 'SKILL.md');
      const version = /^version: (\S+)$/mu.exec(markdown)?.[1];
      Vitest.expect(version).toBeDefined();
      const changelog = read(PACKAGED_DIR, name, 'CHANGELOG.md');
      const newest = /^## \[(\S+)\]/mu.exec(changelog)?.[1];
      Vitest.expect(version).toBe(newest);
    },
  );
});
