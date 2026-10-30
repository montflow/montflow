import * as Vitest from '@effect/vitest';
import * as Profiles from '../index.js';

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

Vitest.describe('Profiles.declaredSkills', () => {
  Vitest.it('reads the skills list in order', () => {
    Vitest.expect(Profiles.declaredSkills(profile)).toStrictEqual([
      'effect',
      'montflow-typescript-services',
    ]);
  });

  Vitest.it('reads none when there is no frontmatter block', () => {
    Vitest.expect(Profiles.declaredSkills('# No frontmatter\n')).toStrictEqual([]);
  });

  Vitest.it('reads none when no skills are declared', () => {
    Vitest.expect(
      Profiles.declaredSkills('---\nname: bare\ndescription: Does X.\n---\n\n# Bare\n'),
    ).toStrictEqual([]);
  });
});

Vitest.describe('Profiles.withIssues', () => {
  const valid = Profiles.verifyProfileFile(
    'effect-reviewer',
    `---\nname: effect-reviewer\ndescription: Does X.\n---\n\n# Effect Reviewer\n\n## Instructions\n\nDo X.\n\n## Review Checklist\n\n- [ ] Done\n`,
  );

  Vitest.it('returns the base result unchanged with no extra issues', () => {
    Vitest.expect(Profiles.withIssues(valid, [])).toStrictEqual(valid);
  });

  Vitest.it('folds extra issues in and marks the result invalid', () => {
    const result = Profiles.withIssues(valid, [
      { field: 'skills', message: "Skill 'missing' is not installed under .agents/skills/." },
    ]);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'skills', message: "Skill 'missing' is not installed under .agents/skills/." },
    ]);
  });
});

Vitest.describe('Profiles.verifyProfileFile skills resolution', () => {
  const raw = `---
name: effect-reviewer
description: Does X.
skills:
  - effect
  - missing
---

# Effect Reviewer

## Instructions

Do X.

## Review Checklist

- [ ] Done
`;
  /** Only `effect` is installed; `missing` is the unresolved name. */
  const skills: Profiles.SkillResolution = { root: '/ws', names: new Set(['effect']) };

  Vitest.it('reports an unresolved name as a warning and stays valid', () => {
    const result = Profiles.verifyProfileFile('effect-reviewer', raw, { skills });
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'skills',
        message: "Skill 'missing' is not installed under /ws/.agents/skills/.",
        severity: 'warning',
      },
    ]);
  });

  Vitest.it('promotes an unresolved name to an error under strict', () => {
    const result = Profiles.verifyProfileFile('effect-reviewer', raw, { skills, strict: true });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain("'missing'");
    Vitest.expect(result.issues[0]?.severity).toBe('error');
  });

  Vitest.it('stays silent when no store was resolved', () => {
    Vitest.expect(Profiles.verifyProfileFile('effect-reviewer', raw)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });
});
