import * as Vitest from 'vitest';

import * as Maybe from '../index.js';

Vitest.describe('[runtime] Maybe.tapNone', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Maybe.tapNone).toBeDefined();
  });
});

Vitest.describe('[types] Maybe.tapNone', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Maybe.tapNone;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
