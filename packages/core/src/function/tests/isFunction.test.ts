import * as Vitest from 'vitest';

import * as Function from '../index.js';

Vitest.describe('[runtime] Function.isFunction', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Function.isFunction).toBeDefined();
  });
});

Vitest.describe('[types] Function.isFunction', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Function.isFunction;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
