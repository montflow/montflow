import * as Vitest from '@effect/vitest';
import * as Workflow from '../index.js';

Vitest.describe('Workflow.makeStep runtime', () => {
  Vitest.it('creates a minimal step with id and kind only', () => {
    Vitest.expect(Workflow.makeStep('s1', 'reviewer')).toStrictEqual(
      new Workflow.Step({ id: 's1', kind: 'reviewer' }),
    );
  });

  Vitest.it('keeps unknown kinds untouched', () => {
    Vitest.expect(Workflow.makeStep('s9', 'hand-written-kind').kind).toBe('hand-written-kind');
  });
});
