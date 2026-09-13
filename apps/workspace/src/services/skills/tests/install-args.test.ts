import * as Vitest from '@effect/vitest';
import * as Skills from '../index.js';

Vitest.describe('Skills.installArgs runtime', () => {
  Vitest.it('syncs every skill into pi, project-local and non-interactive', () => {
    Vitest.expect(Skills.installArgs()).toStrictEqual([
      'skills',
      'add',
      'montflow/montflow',
      '--all',
      '-a',
      'pi',
      '-y',
    ]);
  });
});
