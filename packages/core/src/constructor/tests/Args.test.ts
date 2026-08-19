import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[types] Constructor.Args', () => {
  Vitest.it('should be defined', () => {
    type Test = Constructor.Args<Constructor.Constructor<string, [number]>>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
