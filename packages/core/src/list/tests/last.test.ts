import * as Vitest from 'vitest';

import * as List from '../index.js';

Vitest.describe('[runtime] List.last', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(List.last).toBeDefined();
  });
});

Vitest.describe('[types] List.last', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof List.last;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
