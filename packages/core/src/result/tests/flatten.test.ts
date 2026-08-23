import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.flatten', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.flatten).toBeDefined();
  });

  Vitest.it('should unwrap exactly one nested level from Ok(Ok(...))', () => {
    const flattened = Result.flatten(Result.ok(Result.ok(Result.ok(1))));

    // One level peeled: the payload is still a Result.
    Vitest.expect(Result.isOk(flattened)).toBe(true);
    Vitest.expect(Result.isResult(Result.unwrap(flattened))).toBe(true);
  });

  Vitest.it('should return a non-nested Ok unchanged', () => {
    const self: Result.Result<number, string> = Result.ok(1);

    Vitest.expect(Result.flatten(self)).toBe(self);
  });

  Vitest.it('should return Ok(err(...)) unchanged', () => {
    const self: Result.Result<Result.Result<number, string>, string> = Result.err('inner');

    Vitest.expect(Result.flatten(self)).toBe(self);
  });

  Vitest.it('should return an Err unchanged', () => {
    const self: Result.Result<number, string> = Result.err('outer');

    Vitest.expect(Result.flatten(self)).toBe(self);
  });

  Vitest.it('should support the curried form', () => {
    const flattened = Result.flatten()(Result.ok(Result.ok(2)));

    Vitest.expect(Result.isOk(flattened)).toBe(true);
    Vitest.expect(Result.unwrap(flattened)).toBe(2);
  });
});

Vitest.describe('[types] Result.flatten', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.flatten;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
