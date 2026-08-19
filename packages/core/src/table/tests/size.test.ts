import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[runtime] Table.size', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Table.size).toBeDefined();
  });
});

Vitest.describe('[types] Table.size', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Table.size;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
