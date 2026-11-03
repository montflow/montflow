import * as Fs from 'node:fs';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';

/**
 * Profile discovery stays wired into authoring. The rendered `spec-create`
 * prompt and the `montflow-create-specs` skill must name `mf-profiles list`
 * as the step before choosing `reviewer-profiles`, with `mf-profiles show`
 * as the deep read. Removing the instruction from either file fails this
 * suite. It reads package files only — never installed copies, which are
 * `doctor`'s job.
 */

const PACKAGE_ROOT = NodePath.resolve(import.meta.dirname, '..', '..', '..', '..');
const CREATE_PROMPT_FILE = NodePath.join(PACKAGE_ROOT, 'prompts', 'spec-create.json');
const SKILL_FILE = NodePath.join(PACKAGE_ROOT, 'skills', 'montflow-create-specs', 'SKILL.md');

const read = (path: string): string => Fs.readFileSync(path, 'utf-8');

/** Collapse line wrapping so prose assertions are layout-independent. */
const flat = (text: string): string => text.replace(/\s+/g, ' ');

const template = (): string =>
  // SAFETY: the package ships this prompt as JSON with a string `template`.
  (JSON.parse(read(CREATE_PROMPT_FILE)) as { readonly template: string }).template;

/** The prompt's phase-rules section, where the reviewer choice is made. */
const phaseRules = (): string => {
  const text = template();
  const at = text.indexOf('## 8. Follow the phase rules');
  if (at < 0) throw new Error('prompt drift: no phase-rules section');
  return flat(text.slice(at));
};

/** The skill's `reviewer-profiles` rule: the prose following the field's rule entry. */
const reviewerRule = (): string => {
  const skill = read(SKILL_FILE);
  const at = skill.indexOf('- `reviewer-profiles`');
  if (at < 0) throw new Error('skill drift: no reviewer-profiles rule');
  return flat(skill.slice(at, at + 3000));
};

Vitest.describe('profile discovery', () => {
  Vitest.it('spec-create runs mf-profiles list before the reviewer choice', () => {
    const text = phaseRules();
    const listAt = text.indexOf('mf-profiles list');
    const chooseAt = text.indexOf('Declare a profile only when');
    Vitest.expect(listAt).toBeGreaterThanOrEqual(0);
    Vitest.expect(chooseAt).toBeGreaterThanOrEqual(0);
    Vitest.expect(listAt).toBeLessThan(chooseAt);
    Vitest.expect(text).toContain('/mf-profiles list');
    Vitest.expect(text).toContain('mf-profiles show <name>');
  });

  Vitest.it('spec-create states the empty-list default and the review-task rule', () => {
    const text = phaseRules();
    Vitest.expect(text).toContain('empty `reviewer-profiles` list is the default');
    Vitest.expect(text).toContain('one review round per cycle');
    Vitest.expect(text).toContain('phase budget is unchanged');
    Vitest.expect(text).toContain('not required to carry a review task');
  });

  Vitest.it('skill reviewer-profiles rule names list first and show when needed', () => {
    const rule = reviewerRule();
    Vitest.expect(rule).toContain('mf-profiles list');
    Vitest.expect(rule).toContain('mf-profiles show');
    Vitest.expect(rule).toContain('only when its focus');
    Vitest.expect(rule).toContain('empty list is the default');
    Vitest.expect(rule).toContain('one review round per cycle');
    Vitest.expect(rule).toContain('not required to carry a review task');
  });

  Vitest.it('skill Reference names the profiles CLI', () => {
    const skill = read(SKILL_FILE);
    const refAt = skill.indexOf('# Reference');
    Vitest.expect(refAt).toBeGreaterThanOrEqual(0);
    const ref = skill.slice(refAt);
    Vitest.expect(ref).toContain('mf-profiles list');
    Vitest.expect(ref).toContain('mf-profiles show <name>');
  });
});
