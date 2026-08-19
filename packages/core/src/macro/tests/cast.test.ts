import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.cast', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.cast).toBeDefined();
  });
});

Vitest.describe('[types] Macro.cast', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.cast;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
