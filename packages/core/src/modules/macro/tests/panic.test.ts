import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.panic', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.panic).toBeDefined();
  });
});

Vitest.describe('[types] Macro.panic', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.panic;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
