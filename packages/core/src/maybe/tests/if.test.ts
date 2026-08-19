import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.if', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.if).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.if', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.if;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
