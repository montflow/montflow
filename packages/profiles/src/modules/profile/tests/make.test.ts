import * as Vitest from '@effect/vitest';
import * as Profiles from '../index.js';

Vitest.describe('Profiles.make', () => {
  Vitest.it('creates a profile with empty model, skills, instructions, and checklist', () => {
    Vitest.expect(Profiles.encode(Profiles.make('code-reviewer', 'Reviews code'))).toStrictEqual({
      name: 'code-reviewer',
      description: 'Reviews code',
      model: '',
      skills: [],
      instructions: '',
      checklist: [],
    });
  });
});
