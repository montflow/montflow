import * as Vitest from 'vitest';

import * as Maybe from '../../maybe/index.js';
import * as Result from '../index.js';

// Regression tests: `ok(undefined)` / `err(undefined)` intentionally store an
// `undefined` payload, so the guards must check key *presence* rather than
// non-undefined values. Previously every combinator dispatching on
// `isOk`/`isErr` misclassified these values.
Vitest.describe('[runtime] Result guards with undefined payloads', () => {
  Vitest.it('isOk should accept ok(undefined)', () => {
    Vitest.expect(Result.isOk(Result.ok(undefined))).toBe(true);
    Vitest.expect(Result.isOk(Result.ok())).toBe(true);
  });

  Vitest.it('isErr should accept err(undefined)', () => {
    Vitest.expect(Result.isErr(Result.err(undefined))).toBe(true);
    Vitest.expect(Result.isErr(Result.err())).toBe(true);
  });

  Vitest.it('isResult should accept undefined payloads on both variants', () => {
    Vitest.expect(Result.isResult(Result.ok(undefined))).toBe(true);
    Vitest.expect(Result.isResult(Result.err(undefined))).toBe(true);
  });

  Vitest.it('guards should still reject the opposite variant and foreign shapes', () => {
    Vitest.expect(Result.isOk(Result.err('boom'))).toBe(false);
    Vitest.expect(Result.isErr(Result.ok(42))).toBe(false);
    Vitest.expect(Result.isResult({})).toBe(false);
    Vitest.expect(Result.isResult(null)).toBe(false);
  });

  Vitest.it('unwrap should return undefined for ok(undefined) instead of throwing', () => {
    Vitest.expect(Result.unwrap(Result.ok(undefined))).toBeUndefined();
  });

  Vitest.it('toMaybe should map ok(undefined) to some(undefined), not none()', () => {
    Vitest.expect(Result.toMaybe(Result.ok(undefined))).toEqual(Maybe.some(undefined));
  });

  Vitest.it('flip should swap ok(undefined) into err(undefined)', () => {
    const flipped = Result.flip(Result.ok<undefined>(undefined));
    Vitest.expect(Result.isErr(flipped)).toBe(true);
    Vitest.expect(flipped.error).toBeUndefined();
  });
});
