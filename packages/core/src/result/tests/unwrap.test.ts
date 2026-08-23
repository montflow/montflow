import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.unwrap', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.unwrap).toBeDefined();
  });

  Vitest.it("should return the inner value of an 'Ok'", () => {
    Vitest.expect(Result.unwrap(Result.ok(42))).toBe(42);
  });

  Vitest.it("should throw 'UnwrapError' for an 'Err'", () => {
    const act = () => Result.unwrap(Result.err('boom'));

    Vitest.expect(act).toThrowError(Result.UnwrapError);
  });

  Vitest.it("should carry the failing error payload on the thrown 'UnwrapError'", () => {
    try {
      Result.unwrap(Result.err({ reason: 'boom' }));
      Vitest.expect.unreachable('unwrap should have thrown');
    } catch (error) {
      Vitest.expect(error).toBeInstanceOf(Result.UnwrapError);
      Vitest.expect((error as Result.UnwrapError).message).toContain('{"reason":"boom"}');
    }
  });
});

Vitest.describe('[types] Result.unwrap', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.unwrap;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should return the inner value type', () => {
    Vitest.expectTypeOf(Result.unwrap(Result.ok(42))).toEqualTypeOf<number>();
  });
});
