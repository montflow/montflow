import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.lambda', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.lambda).toBeDefined();
  });
});

Vitest.describe('[types] Macro.lambda', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.lambda;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
