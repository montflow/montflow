import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';

/**
 * The two profile-authoring skills are workspace-only — no package payload
 * ships them — so nothing else would catch a regression to hand verification.
 * Guard the CLI-first contract here: both must discover skills with
 * `mf-skills list` and run `mf-profiles verify <name>` before judging what the
 * verifier cannot.
 */

const SKILLS_DIR = resolve(
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

const read = (name: string): string => readFileSync(resolve(SKILLS_DIR, name, 'SKILL.md'), 'utf8');

const SKILL_NAMES = ['montflow-create-profiles', 'montflow-modify-profiles'] as const;

Vitest.describe('profile authoring skills', () => {
  Vitest.it.each(SKILL_NAMES)('%s: discovers skills with mf-skills list', (name) => {
    Vitest.expect(read(name)).toContain('mf-skills list');
  });

  Vitest.it.each(SKILL_NAMES)('%s: runs mf-profiles verify as the mechanical check', (name) => {
    Vitest.expect(read(name)).toContain('mf-profiles verify <name>');
    Vitest.expect(read(name)).toContain('bun run --cwd packages/profiles cli verify');
  });

  Vitest.it('keeps the subjective checklist beside the mechanical check', () => {
    // The verifier cannot judge the instructions or the checklist quality, so
    // each skill keeps its own judgement step after the CLI gate.
    Vitest.expect(read('montflow-create-profiles')).toContain('## Review Checklist');
    Vitest.expect(read('montflow-modify-profiles')).toContain('GATES.md');
  });
});
