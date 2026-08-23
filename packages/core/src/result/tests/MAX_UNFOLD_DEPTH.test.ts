import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.MAX_UNFOLD_DEPTH', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.MAX_UNFOLD_DEPTH).toBeDefined();
  });

  Vitest.it('should equal 512', () => {
    Vitest.expect(Result.MAX_UNFOLD_DEPTH).toBe(512);
  });

  Vitest.it('should bound how many layers unfold peels before truncating', () => {
    let deep: Result.Result<number, string> = Result.ok(42);
    // Build nesting deeper than MAX_UNFOLD_DEPTH.
    for (let i = 0; i < Result.MAX_UNFOLD_DEPTH + 100; i++) deep = Result.ok(deep);

    const unfolded = Result.unfold(deep);

    // Truncated: the result is still an Ok whose payload is itself a Result.
    Vitest.expect(Result.isOk(unfolded)).toBe(true);
    Vitest.expect(Result.isResult((unfolded as { value: unknown }).value)).toBe(true);
  });
});

Vitest.describe('[types] Result.MAX_UNFOLD_DEPTH', () => {
  Vitest.it('should be the literal type 512', () => {
    type Test = typeof Result.MAX_UNFOLD_DEPTH;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<512>();
    Vitest.expectTypeOf<typeof Result.MAX_UNFOLD_DEPTH>().not.toEqualTypeOf<undefined>();
  });
});
