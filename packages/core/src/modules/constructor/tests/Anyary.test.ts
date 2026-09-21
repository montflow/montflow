import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[types] Constructor.Anyary', () => {
  Vitest.it('should be defined', () => {
    type Test = Constructor.Anyary<string>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
