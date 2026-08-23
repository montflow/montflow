import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.filter', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.filter).toBeDefined();
  });

  Vitest.it("should keep 'Ok' when the predicate passes", () => {
    const result = Result.filter(Result.ok(2), (value) => value > 1, 'too small');

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(Result.unwrap(result)).toBe(2);
  });

  Vitest.it("should turn 'Ok' into 'Err(onFail)' when the predicate fails", () => {
    const result = Result.filter(Result.ok(0), (value) => value > 1, 'too small');

    if (Result.isErr(result)) {
      Vitest.expect(result.error).toBe('too small');
    } else {
      Vitest.expect.unreachable('failed predicate should produce Err');
    }
  });

  Vitest.it('should evaluate a thunk onFail on failure', () => {
    const result = Result.filter(Result.ok(0), (value) => value > 1, () => 'too small');

    if (Result.isErr(result)) {
      Vitest.expect(result.error).toBe('too small');
    } else {
      Vitest.expect.unreachable('failed predicate should produce Err');
    }
  });

  Vitest.it("should pass a pre-existing 'Err' through unchanged", () => {
    const self: Result.Result<number, string> = Result.err('e');

    const result = Result.filter(self, (value) => value > 1, 'too small');

    Vitest.expect(result).toBe(self);
  });

  Vitest.it("should not evaluate the onFail thunk on the 'Ok' path", () => {
    let evaluated = false;
    const onFail = () => {
      evaluated = true;
      return 'never';
    };

    const result = Result.filter(Result.ok(2), (value) => value > 1, onFail);

    Vitest.expect(Result.isOk(result)).toBe(true);
    Vitest.expect(evaluated).toBe(false);
  });

  Vitest.it('should support the curried form', () => {
    const result = Result.filter((value: number) => value > 1, 'too small')(Result.ok(2));

    Vitest.expect(Result.unwrap(result)).toBe(2);
  });
});

Vitest.describe('[types] Result.filter', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.filter;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should union the source and failure error channels', () => {
    Vitest.expectTypeOf(
      Result.filter(Result.ok(1), (value: number) => value > 0, 'small'),
    ).toEqualTypeOf<Result.Result<number, string>>();
  });
});