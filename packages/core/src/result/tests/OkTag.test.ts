import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[runtime] Result.OkTag', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.OkTag).toBeDefined();
  });

  Vitest.it('should equal "ok"', () => {
    Vitest.expect(Result.OkTag).toBe('ok');
  });

  Vitest.it('should tag values built by ok()', () => {
    Vitest.expect(Result.ok(1)['_tag']).toBe(Result.OkTag);
    Vitest.expect(Result.err('e')['_tag']).not.toBe(Result.OkTag);
  });
});

Vitest.describe('[types] Result.OkTag', () => {
  Vitest.it('should be the literal type "ok"', () => {
    type Test = Result.OkTag;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<'ok'>();
    Vitest.expectTypeOf<Result.OkTag>().not.toEqualTypeOf<undefined>();
  });
});
