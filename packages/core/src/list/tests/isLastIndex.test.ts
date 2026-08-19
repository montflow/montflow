import * as Vitest from 'vitest';

import * as List from '../index.js';

Vitest.describe('[runtime] List.isLastIndex', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(List.isLastIndex).toBeDefined();
  });
});

Vitest.describe('[types] List.isLastIndex', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof List.isLastIndex;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
