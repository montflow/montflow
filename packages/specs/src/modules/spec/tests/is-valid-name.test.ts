import * as Vitest from '@effect/vitest';
import * as Spec from '../index.js';

Vitest.describe('Spec.isValidName runtime', () => {
  Vitest.it('accepts lowercase hyphen-separated slugs', () => {
    Vitest.expect(Spec.isValidName('ship-spec')).toBe(true);
    Vitest.expect(Spec.isValidName('spec2')).toBe(true);
  });

  Vitest.it('rejects names with spaces, capitals, or edge hyphens', () => {
    Vitest.expect(Spec.isValidName('Ship Spec')).toBe(false);
    Vitest.expect(Spec.isValidName('-ship')).toBe(false);
    Vitest.expect(Spec.isValidName('ship-')).toBe(false);
    Vitest.expect(Spec.isValidName('')).toBe(false);
  });
});
