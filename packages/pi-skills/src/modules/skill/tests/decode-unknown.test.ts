import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Skill from '../index.js';

const valid = {
  id: 'adversarial-review',
  name: 'adversarial-review',
  description: 'Hostile, bug-hunting code review.',
  groups: ['testing'],
  dependencies: ['executing-skills'],
  body: 'Assume the code is broken. Prove otherwise.',
};

Vitest.describe('Skill.decodeUnknown', () => {
  Vitest.it.effect('decodes valid input into a Skill', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.decodeUnknown(valid);
      Vitest.expect(skill.id).toBe('adversarial-review');
      Vitest.expect(skill.groups).toStrictEqual(['testing']);
    }),
  );

  Vitest.it.effect('fails on non-slug ids', () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(Skill.decodeUnknown({ ...valid, id: 'Bad Name' }));
      Vitest.expect(String(error)).toContain('["id"]');
    }),
  );
});

Vitest.describe('Skill.encode', () => {
  Vitest.it.effect('round-trips through decode', () =>
    Effect.gen(function* () {
      const skill = yield* Skill.decodeUnknown(valid);
      const decoded = yield* Skill.decodeUnknown(Skill.encode(skill));
      Vitest.expect(decoded).toStrictEqual(skill);
    }),
  );
});
