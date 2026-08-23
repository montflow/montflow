import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.orElse', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.orElse).toBeDefined();
  });

  Vitest.it("should return the inner value of an 'Ok'", () => {
    Vitest.expect(Result.orElse(Result.ok(1), 0)).toBe(1);
  });

  Vitest.it("should return the fallback for an 'Err'", () => {
    Vitest.expect(Result.orElse(Result.err('e'), 0)).toBe(0);
  });

  Vitest.it('should evaluate a thunk fallback for an Err', () => {
    Vitest.expect(Result.orElse(Result.err('e'), () => 99)).toBe(99);
  });

  Vitest.it("should not evaluate the thunk when the result is 'Ok'", () => {
    let evaluated = false;
    const onFail = () => {
      evaluated = true;
      return 99;
    };

    Vitest.expect(Result.orElse(Result.ok(1), onFail)).toBe(1);
    Vitest.expect(evaluated).toBe(false);
  });

  Vitest.it('should support the curried form', () => {
    Vitest.expect(Result.orElse(0)(Result.err('e'))).toBe(0);
    Vitest.expect(Result.orElse(0)(Result.ok(1))).toBe(1);
  });
});

Vitest.describe('[types] Result.orElse', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.orElse;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should collapse both channels into the value type', () => {
    Vitest.expectTypeOf(Result.orElse(Result.ok(1), 0)).toEqualTypeOf<number>();
  });
});