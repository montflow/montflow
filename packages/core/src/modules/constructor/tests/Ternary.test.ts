import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[types] Constructor.Ternary', () => {
  Vitest.it('should be defined', () => {
    type Test = Constructor.Ternary<string, number, boolean, object>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
