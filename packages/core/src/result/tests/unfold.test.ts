import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.unfold', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.unfold).toBeDefined();
  });

  Vitest.it('should fully unwrap deeply nested Ok values', () => {
    const deep = Result.ok(Result.ok(Result.ok(42)));

    const unfolded = Result.unfold(deep);

    Vitest.expect(Result.isOk(unfolded)).toBe(true);
    Vitest.expect(Result.unwrap(unfolded)).toBe(42);
  });

  Vitest.it('should short-circuit on a nested Err at any level', () => {
    const deep = Result.ok(Result.err('inner'));

    const unfolded = Result.unfold(deep);

    Vitest.expect(Result.isErr(unfolded)).toBe(true);
    Vitest.expect(Result.unwrap(Result.flip(unfolded))).toBe('inner');
  });

  Vitest.it('should return an Err unchanged (Err is its own unfold)', () => {
    const self = Result.err('outer');

    Vitest.expect(Result.unfold(self)).toBe(self);
  });

  Vitest.it('should terminate on cyclic inputs without stack overflow', () => {
    // SAFETY: test-only cycle; the runtime loop is iterative and truncates at
    // MAX_UNFOLD_DEPTH instead of recursing.
    const cyclic = Result.ok(42) as unknown as { value: unknown };
    cyclic.value = cyclic;

    const unfolded = Result.unfold(cyclic as unknown as Result.Result<number, never>);

    Vitest.expect(Result.isResult(unfolded)).toBe(true);
  });
});

Vitest.describe('[types] Result.unfold', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.unfold;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
