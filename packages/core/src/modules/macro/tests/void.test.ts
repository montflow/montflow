import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.void', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.void).toEqual(void 0);
  });
});

Vitest.describe('[types] Macro.void', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.void;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
