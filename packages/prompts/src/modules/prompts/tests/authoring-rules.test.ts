import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Vitest from '@effect/vitest';
import * as Prompts from '../index.js';

/**
 * The packaged skill restates the authoring rules for an agent. If either
 * surface loses the condition field or the earlier-controller rule, the two
 * disagree about what the verifier accepts — exactly the drift this guard
 * exists to catch.
 */
const packagedSkill = readFileSync(
  resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    '..',
    'skills',
    'montflow-create-prompts',
    'SKILL.md',
  ),
  'utf8',
);

Vitest.describe('authoring rules and packaged skill', () => {
  Vitest.it('both mention the condition field', () => {
    for (const text of [Prompts.authoringRules(), packagedSkill]) {
      Vitest.expect(text).toContain('"when"');
      Vitest.expect(text).toMatch(/condition/iu);
    }
  });

  Vitest.it('both state the earlier-controller rule', () => {
    for (const text of [Prompts.authoringRules(), packagedSkill]) {
      Vitest.expect(text).toMatch(/earlier/iu);
      Vitest.expect(text).toMatch(/controller/iu);
    }
  });

  Vitest.it('both show the guard alignment on the conditional child', () => {
    for (const text of [Prompts.authoringRules(), packagedSkill]) {
      Vitest.expect(text).toMatch(/\{\{#if origin\}\}/u);
    }
  });

  Vitest.it('both list every variable kind and the confirm field rules', () => {
    for (const text of [Prompts.authoringRules(), packagedSkill]) {
      for (const kind of ['"text"', '"textarea"', '"select"', '"confirm"']) {
        Vitest.expect(text).toContain(kind);
      }
      Vitest.expect(text.replaceAll('`', '').replace(/\s+/gu, ' ')).toContain(
        'no "options", "default", or "required"',
      );
      Vitest.expect(text).toMatch(/boolean question/iu);
    }
  });
});
