import * as Vitest from 'vitest';

import * as Result from '../index.js';

Vitest.describe('[types] Result.Promise', () => {
  Vitest.it('should be defined', () => {
    type Test = Result.Promise<any, any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should be a Promise resolving to Result<V, E>', () => {
    Vitest.expectTypeOf<Result.Promise<number, string>>().toEqualTypeOf<
      globalThis.Promise<Result.Result<number, string>>
    >();
  });

  Vitest.it('should await to a Result<V, E>', () => {
    Vitest.expectTypeOf<Awaited<Result.Promise<number, string>>>().toEqualTypeOf<
      Result.Result<number, string>
    >();
  });
});