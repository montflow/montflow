import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[types] Result.Ok', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Ok<number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should expose the documented variant shape', () => {
    type Test = Result.Ok<string>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<{
      readonly [Domain.Id]: Result.Id;
      readonly [Domain.Tag]: Result.OkTag;
      readonly value: string;
    }>();
  });

  Vitest.it('should carry the declared payload type', () => {
    Vitest.expectTypeOf<Result.Ok<number>['value']>().toEqualTypeOf<number>();
  });

  Vitest.it('should accept values produced by ok()', () => {
    Vitest.expectTypeOf(Result.ok(1)).toExtend<Result.Ok<number>>();
    Vitest.expectTypeOf<Result.Err<string>>().not.toExtend<Result.Ok<number>>();
  });
});
