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
    },
  );
});
