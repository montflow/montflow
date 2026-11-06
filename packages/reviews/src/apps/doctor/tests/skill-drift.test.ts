import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';
import { ROUND_META_FIELDS, authoringRules } from '../../../modules/review/index.js';

/**
 * The adversarial-review skill teaches an agent the round-file grammar the
 * verifier enforces. Guard the instruction file against the grammar constants
 * so a renamed or added round-metadata field cannot pass review unnoticed.
 * (The packaged copy is already held byte-for-byte to the embed by
 * `embedded-payload.test.ts`; this test compares it to the grammar itself.)
 */

const SKILLS_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'skills',
);

const SKILL = readFileSync(resolve(SKILLS_DIR, 'montflow-adversarial-review', 'SKILL.md'), 'utf8');

Vitest.describe('adversarial-review skill against the round grammar', () => {
  Vitest.it.each(ROUND_META_FIELDS)(
    'the skill documents the required round field "%s"',
    (label) => {
      Vitest.expect(SKILL).toContain(`- ${label}:`);
      Vitest.expect(authoringRules()).toContain(`- ${label}:`);
    },
  );

  Vitest.it('the skill documents the optional Phase round field', () => {
    Vitest.expect(SKILL).toContain('- Phase:');
    Vitest.expect(authoringRules()).toContain('- Phase:');
  });

  Vitest.it(
    'the skill documents the explicit-round and per-profile-series dispatch contract',
    () => {
      Vitest.expect(SKILL).toContain('explicit round');
      Vitest.expect(SKILL).toContain('one per declared reviewer profile');
      Vitest.expect(SKILL).toContain('mf-reviews create <name> --round <NNN>');
    },
  );

  Vitest.it('takes the round from the CLI instead of a directory scan', () => {
    // All three verbs the workflow needs: discovery, a new round, a re-review.
    for (const command of [
      'mf-reviews list --verbose',
      'mf-reviews create <name>',
      'mf-reviews resume <name>',
    ]) {
      Vitest.expect(SKILL).toContain(command);
    }
    // The removed rule, verbatim; the explicit-round bullet may still warn
    // against computing this, but the default path must not use it.
    Vitest.expect(SKILL).not.toContain('highest existing number + 1');
    Vitest.expect(SKILL).toContain('bun run --cwd packages/reviews cli');
  });
});
