import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.Id', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.Id).toBeDefined();
  });

  Vitest.it('should equal "result"', () => {
    Vitest.expect(Result.Id).toBe('result');
  });

  Vitest.it('should identify values built by ok() and err()', () => {
    Vitest.expect(Result.ok(1)['_id']).toBe(Result.Id);
    Vitest.expect(Result.err('e')['_id']).toBe(Result.Id);
  });
});

Vitest.describe('[types] Result.Id', () => {
  Vitest.it('should be the literal type "result"', () => {
    type Test = Result.Id;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<'result'>();
    Vitest.expectTypeOf<Result.Id>().not.toEqualTypeOf<undefined>();
  });
});
