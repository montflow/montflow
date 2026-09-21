import { Option } from 'effect';
import * as Vitest from '@effect/vitest';

import * as ArrayExt from '../index.js';

Vitest.describe('ArrayExt.maybeLastIndex runtime', () => {
  Vitest.it('returns none for an empty array', () => {
    Vitest.expect(Option.isNone(ArrayExt.maybeLastIndex([]))).toBe(true);
  });

  Vitest.it('returns some(length - 1) for a non-empty array', () => {
    Vitest.expect(Option.getOrThrow(ArrayExt.maybeLastIndex([10, 20, 30]))).toBe(2);
    Vitest.expect(Option.getOrThrow(ArrayExt.maybeLastIndex(['only']))).toBe(0);
  });

  Vitest.it('returns some(0) for a single-element array', () => {
    const result = ArrayExt.maybeLastIndex(['only']);
    Vitest.expect(Option.isSome(result)).toBe(true);
    Vitest.expect(Option.getOrThrow(result)).toBe(0);
  });
});
