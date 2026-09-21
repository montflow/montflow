import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[types] Constructor.Octonary', () => {
  Vitest.it('should be defined', () => {
    type Test = Constructor.Octonary<
      string,
      number,
      boolean,
      object,
      any,
      unknown,
      null,
      undefined,
      void
    >;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
