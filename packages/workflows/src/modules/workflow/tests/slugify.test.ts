import * as Vitest from '@effect/vitest';
import * as Workflow from '../index.js';

Vitest.describe('Workflow.slugify runtime', () => {
  Vitest.it('lowercases and hyphenates display names', () => {
    Vitest.expect(Workflow.slugify('Ship Feature')).toBe('ship-feature');
  });

  Vitest.it('collapses runs and trims edge hyphens', () => {
    Vitest.expect(Workflow.slugify('  Ship__Feature!! ')).toBe('ship-feature');
  });
});
