import * as Vitest from '@effect/vitest';
import * as Workflow from '../index.js';

Vitest.describe('Workflow.make runtime', () => {
  Vitest.it('creates a workflow with no steps', () => {
    Vitest.expect(Workflow.make('ship-feature', 'Ship a feature.')).toStrictEqual(
      new Workflow.Workflow({
        name: 'ship-feature',
        description: 'Ship a feature.',
        steps: [],
      }),
    );
  });

  Vitest.it('defaults to an empty description', () => {
    Vitest.expect(Workflow.make('ship-feature').description).toBe('');
  });
});
