import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[runtime] Function.Constructor', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Function.Constructor).toBeDefined();
  });
});

Vitest.describe('[types] Function.Constructor', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Function.Constructor;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
