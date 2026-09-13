import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as Workflow from '../index.js';

const valid = {
  name: 'ship-feature',
  description: 'Ship a feature.',
  prompt: 'You are shipping a feature.',
  steps: [
    { id: 's1', kind: 'reviewer', label: 'Reviewers', model: 'acme/reviewer', concurrency: 3 },
    {
      id: 's2',
      kind: 'fixer',
      prompt: 'Apply the findings.',
      params: { waves: 2 },
    },
    { id: 's3', kind: 'hand-written-kind' },
  ],
};

Vitest.describe('Workflow.decodeUnknown runtime', () => {
  Vitest.it.effect('decodes a valid workflow', () =>
    Effect.gen(function* () {
      const workflow = yield* Workflow.decodeUnknown(valid);
      Vitest.expect(workflow.name).toBe('ship-feature');
      Vitest.expect(workflow.steps.length).toBe(3);
      Vitest.expect(workflow.steps[0]?.kind).toBe('reviewer');
      Vitest.expect(workflow.steps[0]?.concurrency).toBe(3);
    }),
  );

  Vitest.it.effect('rejects an empty name', () =>
    Effect.gen(function* () {
      const error = yield* Workflow.decodeUnknown({ ...valid, name: '' }).pipe(Effect.flip);
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('rejects a step with an empty id', () =>
    Effect.gen(function* () {
      const error = yield* Workflow.decodeUnknown({
        ...valid,
        steps: [{ id: '', kind: 'reviewer' }],
      }).pipe(Effect.flip);
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('round-trips through encode', () =>
    Effect.gen(function* () {
      const workflow = yield* Workflow.decodeUnknown(valid);
      Vitest.expect(Workflow.encode(workflow)).toStrictEqual(valid);
    }),
  );
});
