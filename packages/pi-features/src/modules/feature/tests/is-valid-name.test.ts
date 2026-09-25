import * as Vitest from '@effect/vitest';
import * as Feature from '../index.js';

Vitest.describe('Feature.isValidName runtime', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(Feature.isValidName('ship-feature')).toBe(true);
    Vitest.expect(Feature.isValidName('feature2')).toBe(true);
  });

  Vitest.it('rejects names with spaces, capitals, or edge hyphens', () => {
    Vitest.expect(Feature.isValidName('Ship Feature')).toBe(false);
    Vitest.expect(Feature.isValidName('-ship')).toBe(false);
    Vitest.expect(Feature.isValidName('ship-')).toBe(false);
    Vitest.expect(Feature.isValidName('')).toBe(false);
  });
});
