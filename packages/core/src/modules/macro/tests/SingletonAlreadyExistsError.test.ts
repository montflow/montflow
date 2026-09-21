import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.SingletonAlreadyExistsError', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.SingletonAlreadyExistsError).toBeDefined();
  });
});

Vitest.describe('[types] Macro.SingletonAlreadyExistsError', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.SingletonAlreadyExistsError;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
