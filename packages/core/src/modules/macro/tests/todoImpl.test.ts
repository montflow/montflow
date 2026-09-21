import * as Vitest from 'vitest';

import * as Macro from '../index.js';

Vitest.describe('[runtime] Macro.todoImpl', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Macro.todoImpl).toBeDefined();
  });
});

Vitest.describe('[types] Macro.todoImpl', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Macro.todoImpl;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
