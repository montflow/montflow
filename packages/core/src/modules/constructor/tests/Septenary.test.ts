import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[types] Constructor.Septenary', () => {
  Vitest.it('should be defined', () => {
    type Test = Constructor.Septenary<
      string,
      number,
      boolean,
      object,
      any,
      unknown,
      null,
      undefined
    >;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
