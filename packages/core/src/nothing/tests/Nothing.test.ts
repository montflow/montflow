import * as Vitest from 'vitest';

import * as Nothing from '../index.js';

Vitest.describe('[types] Nothing.Nothing', () => {
  Vitest.it('should be defined', () => {
    type Test = Nothing.Nothing;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
