import * as Vitest from '@effect/vitest';
import * as Spec from '../index.js';

Vitest.describe('Spec.isValidPhase runtime', () => {
  Vitest.it('accepts one or two uppercase letters', () => {
    Vitest.expect(Spec.isValidPhase('A')).toBe(true);
    Vitest.expect(Spec.isValidPhase('Z')).toBe(true);
    Vitest.expect(Spec.isValidPhase('AA')).toBe(true);
    Vitest.expect(Spec.isValidPhase('AB')).toBe(true);
  });

  Vitest.it('rejects lowercase, digits, spaces, and traversal values', () => {
    Vitest.expect(Spec.isValidPhase('a')).toBe(false);
    Vitest.expect(Spec.isValidPhase('A1')).toBe(false);
    Vitest.expect(Spec.isValidPhase('AAA')).toBe(false);
    Vitest.expect(Spec.isValidPhase('A B')).toBe(false);
    Vitest.expect(Spec.isValidPhase('')).toBe(false);
    Vitest.expect(Spec.isValidPhase('..')).toBe(false);
    Vitest.expect(Spec.isValidPhase('../../etc')).toBe(false);
  });
});
