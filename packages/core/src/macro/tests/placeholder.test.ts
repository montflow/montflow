import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.placeholder', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.placeholder).toBeDefined();
  });
});

Vitest.describe('[types] Macro.placeholder', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.placeholder;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
