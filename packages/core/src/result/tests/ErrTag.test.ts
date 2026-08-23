import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.ErrTag', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.ErrTag).toBeDefined();
  });

  Vitest.it('should equal "err"', () => {
    Vitest.expect(Result.ErrTag).toBe('err');
  });

  Vitest.it('should tag values built by err()', () => {
    Vitest.expect(Result.err('e')['_tag']).toBe(Result.ErrTag);
    Vitest.expect(Result.ok(1)['_tag']).not.toBe(Result.ErrTag);
  });
});

Vitest.describe('[types] Result.ErrTag', () => {
  Vitest.it('should be the literal type "err"', () => {
    type Test = Result.ErrTag;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<'err'>();
    Vitest.expectTypeOf<Result.ErrTag>().not.toEqualTypeOf<undefined>();
  });
});
