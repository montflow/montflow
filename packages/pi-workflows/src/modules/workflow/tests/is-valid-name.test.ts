import * as Vitest from '@effect/vitest';
import * as Workflow from '../index.js';

Vitest.describe('Workflow.isValidName runtime', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(Workflow.isValidName('ship-feature')).toBe(true);
    Vitest.expect(Workflow.isValidName('feature2')).toBe(true);
  });

  Vitest.it('rejects names with spaces, capitals, or edge hyphens', () => {
    Vitest.expect(Workflow.isValidName('Ship Feature')).toBe(false);
    Vitest.expect(Workflow.isValidName('-ship')).toBe(false);
    Vitest.expect(Workflow.isValidName('ship-')).toBe(false);
    Vitest.expect(Workflow.isValidName('')).toBe(false);
  });
});
