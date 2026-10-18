import * as Vitest from '@effect/vitest';
import * as PiProfiles from '../index.js';

Vitest.describe('PiProfiles.make', () => {
  Vitest.it('creates a profile with empty model, skills, instructions, and checklist', () => {
    Vitest.expect(
      PiProfiles.encode(PiProfiles.make('code-reviewer', 'Reviews code')),
    ).toStrictEqual({
      name: 'code-reviewer',
      description: 'Reviews code',
      model: '',
      skills: [],
      instructions: '',
      checklist: [],
    });
  });
});
