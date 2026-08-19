import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.undefined', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.undefined).toEqual(void 0);
  });
});

Vitest.describe('[types] Macro.undefined', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.undefined;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<undefined>();
  });
});
