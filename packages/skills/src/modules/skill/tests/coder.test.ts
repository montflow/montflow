import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Skill from '../index.js';

/**
 * The file codec is what makes a hand-authored SKILL.md round-trip through the
 * store without losing the immutable `id` or the author/version metadata the
 * verifier requires. These tests pin that round trip.
 */

const FILE = `---
name: demo
description: A demo skill.
id: 0123456789abcdef
author: montflow
version: 1.2.0
license: MIT
groups:
  - testing
dependencies:
  - executing-skills
---

# When To Use

x

# Pipeline

y

# Reference

z
`;

Vitest.describe('Skill.decodeSkillFile', () => {
  Vitest.it.effect('reads every frontmatter field', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.decodeSkillFile('demo', FILE);
      Vitest.expect(skill.id).toBe('demo');
      Vitest.expect(skill.name).toBe('demo');
      Vitest.expect(skill.skillId).toBe('0123456789abcdef');
      Vitest.expect(skill.author).toBe('montflow');
      Vitest.expect(skill.version).toBe('1.2.0');
      Vitest.expect(skill.license).toBe('MIT');
      Vitest.expect(skill.groups).toStrictEqual(['testing']);
      Vitest.expect(skill.dependencies).toStrictEqual(['executing-skills']);
    }),
  );

  Vitest.it.effect('falls back to the directory name when `name` is absent', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.decodeSkillFile(
        'fallback',
        '---\ndescription: no name here\n---\nbody\n',
      );
      Vitest.expect(skill.name).toBe('fallback');
      Vitest.expect(skill.skillId).toBeUndefined();
    }),
  );

  Vitest.it.effect('malformed input fails', () =>
    Effect.gen(function* () {
      const error = yield* Skill.decodeSkillFile('broken', '# no frontmatter\n').pipe(Effect.flip);
      Vitest.expect(error).toContain('broken');
    }),
  );
});

Vitest.describe('Skill.encodeSkillFile', () => {
  Vitest.it.effect('round-trips every field through decode', () =>
    Effect.gen(function* () {
      const decoded = yield* Skill.decodeSkillFile('demo', FILE);
      const encoded = Skill.encodeSkillFile(decoded);
      const redecoded = yield* Skill.decodeSkillFile('demo', encoded);
      Vitest.expect(redecoded.skillId).toBe(decoded.skillId);
      Vitest.expect(redecoded.author).toBe(decoded.author);
      Vitest.expect(redecoded.version).toBe(decoded.version);
      Vitest.expect(redecoded.license).toBe(decoded.license);
      Vitest.expect(redecoded.groups).toStrictEqual(decoded.groups);
      Vitest.expect(redecoded.dependencies).toStrictEqual(decoded.dependencies);
    }),
  );

  Vitest.it.effect('drops empty optional keys', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.decodeUnknown({
        id: 'slim',
        name: 'slim',
        description: 'd',
        groups: [],
        dependencies: [],
        body: 'b',
      });
      const encoded = Skill.encodeSkillFile(skill);
      Vitest.expect(encoded).not.toContain('id:');
      Vitest.expect(encoded).not.toContain('author:');
      Vitest.expect(encoded).not.toContain('version:');
      Vitest.expect(encoded).not.toContain('license:');
      Vitest.expect(encoded).not.toContain('groups:');
    }),
  );
});
