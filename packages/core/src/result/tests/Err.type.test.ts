import * as Vitest from 'vitest';

import * as Domain from '../../domain/index.js';
import * as Result from '../index.js';

Vitest.describe('[types] Result.Err', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Err<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should expose the documented variant shape', () => {
    type Test = Result.Err<string>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<{
      readonly [Domain.Id]: Result.Id;
      readonly [Domain.Tag]: Result.ErrTag;
      readonly error: string;
    }>();
  });

  Vitest.it('should carry the declared payload type', () => {
    Vitest.expectTypeOf<Result.Err<number>['error']>().toEqualTypeOf<number>();
    Vitest.expectTypeOf<Result.Err<number>['error']>().not.toEqualTypeOf<string>();
  });
});
