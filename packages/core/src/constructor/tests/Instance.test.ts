import * as Vitest from 'vitest';

import * as Constructor from '../index.js';

Vitest.describe('[types] Constructor.Instance', () => {
  Vitest.it('should be defined', () => {
    type Test = Constructor.Instance<Constructor.Constructor<string, [number]>>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
