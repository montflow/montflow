import * as Vitest from '@effect/vitest';
import * as Skill from '../index.js';

const validFile = `---
name: test-skill
description: Does X when Y shows up. Use when testing skills.
id: a1b2c3d4e5f6a7b8
author: Tester
version: 1.0.0
groups:
  - testing
dependencies:
  - executing-skills
---

# When To Use

Use when testing.

# Pipeline

Do the thing.

# Reference

Nothing.
`;

Vitest.describe('Skill.verifySkillFile', () => {
  Vitest.it('accepts a standard-shaped file', () => {
    const result = Skill.verifySkillFile('test-skill', validFile);
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('fails without a frontmatter block', () => {
    const result = Skill.verifySkillFile('test-skill', '# Just a body\n');
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'frontmatter', message: 'Missing frontmatter block.' },
    ]);
  });

  Vitest.it('flags missing required fields', () => {
    const result = Skill.verifySkillFile(
      'test-skill',
      '---\nname: test-skill\ndescription: Does X.\n---\n\nBody.\n',
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.map((found) => found.field).toSorted()).toStrictEqual([
      'author',
      'body',
      'body',
      'body',
      'id',
      'version',
    ]);
  });

  Vitest.it('flags a malformed id and version', () => {
    const result = Skill.verifySkillFile(
      'test-skill',
      [
        '---',
        'name: test-skill',
        'description: Does X.',
        'id: NOT-HEX',
        'author: Tester',
        'version: someday',
        '---',
        '',
        '# When To Use',
        '',
        'X.',
        '',
        '# Pipeline',
        '',
        'Y.',
        '',
        '# Reference',
        '',
        'Z.',
        '',
      ].join('\n'),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'id', message: 'Must be exactly 16 lowercase hex chars.' },
      { field: 'version', message: 'Must be a SemVer string starting at 1.0.0.' },
    ]);
  });

  Vitest.it('flags a name that mismatches the directory', () => {
    const result = Skill.verifySkillFile(
      'test-skill',
      [
        '---',
        'name: other-name',
        'description: Does X.',
        'id: a1b2c3d4e5f6a7b8',
        'author: Tester',
        'version: 1.0.0',
        '---',
        '',
        '# When To Use',
        '',
        'X.',
        '',
        '# Pipeline',
        '',
        'Y.',
        '',
        '# Reference',
        '',
        'Z.',
        '',
      ].join('\n'),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'name', message: "Must match the directory name 'test-skill'." },
    ]);
  });

  Vitest.it('flags scalar groups and an overlong description', () => {
    const result = Skill.verifySkillFile(
      'test-skill',
      [
        '---',
        'name: test-skill',
        `description: ${'x'.repeat(1025)}`,
        'id: a1b2c3d4e5f6a7b8',
        'author: Tester',
        'version: 1.0.0',
        'groups: testing',
        '---',
        '',
        '# When To Use',
        '',
        'X.',
        '',
        '# Pipeline',
        '',
        'Y.',
        '',
        '# Reference',
        '',
        'Z.',
        '',
      ].join('\n'),
    );
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      { field: 'description', message: 'Must be 1-1024 chars.' },
      { field: 'groups', message: 'Must be a YAML list.' },
    ]);
  });
});

Vitest.describe('Skill.verifyInfoLine', () => {
  Vitest.it('renders the verified check', () => {
    Vitest.expect(Skill.verifyInfoLine({ valid: true, issues: [] })).toBe('✓ verified');
  });

  Vitest.it('renders the unverified cross with a count', () => {
    Vitest.expect(
      Skill.verifyInfoLine({
        valid: false,
        issues: [
          { field: 'id', message: 'Missing.' },
          { field: 'body', message: 'Missing.' },
        ],
      }),
    ).toBe('✗ not verified — 2 issues');
  });
});
