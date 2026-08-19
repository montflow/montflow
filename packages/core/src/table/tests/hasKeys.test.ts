import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[runtime] Table.hasKeys', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Table.hasKeys).toBeDefined();
  });
});

Vitest.describe('[types] Table.hasKeys', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Table.hasKeys;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
