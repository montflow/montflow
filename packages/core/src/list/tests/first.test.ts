import * as Vitest from 'vitest';

import * as List from '../index.js';

Vitest.describe('[runtime] List.first', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(List.first).toBeDefined();
  });
});

Vitest.describe('[types] List.first', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof List.first;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
