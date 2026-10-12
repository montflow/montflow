import * as Vitest from '@effect/vitest';
import * as PiProfiles from '../index.js';

const profile = `---
name: effect-reviewer
description: Reviews Effect code.
skills:
  - effect
  - montflow-typescript-services
---

# Effect Reviewer

## Instructions

Review.

## Review Checklist

- [ ] Done
`;

Vitest.describe('PiProfiles.declaredSkills', () => {
  Vitest.it('reads the skills list in order', () => {
    Vitest.expect(PiProfiles.declaredSkills(profile)).toStrictEqual([
      'effect',
      'montflow-typescript-services',
    ]);
  });

  Vitest.it('reads none when there is no frontmatter block', () => {
    Vitest.expect(PiProfiles.declaredSkills('# No frontmatter\n')).toStrictEqual([]);
  });

  Vitest.it('reads none when no skills are declared', () => {
    Vitest.expect(
      PiProfiles.declaredSkills('---\nname: bare\ndescription: Does X.\n---\n\n# Bare\n'),
    ).toStrictEqual([]);
  });
});

Vitest.describe('PiProfiles.withIssues', () => {
  const valid = PiProfiles.verifyProfileFile(
    'effect-reviewer',
    `---\nname: effect-reviewer\ndescription: Does X.\n---\n\n# Effect Reviewer\n\n## Instructions\n\nDo X.\n\n## Review Checklist\n\n- [ ] Done\n`,
  );

  Vitest.it('returns the base result unchanged with no extra issues', () => {
    Vitest.expect(PiProfiles.withIssues(valid, [])).toStrictEqual(valid);
  });

  Vitest.it('folds extra issues in and marks the result invalid', () => {
    const result = PiProfiles.withIssues(valid, [
      { field: 'skills', message: "Skill 'missing' is not installed under .agents/skills/." },
    ]);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'skills', message: "Skill 'missing' is not installed under .agents/skills/." },
    ]);
  });
});
