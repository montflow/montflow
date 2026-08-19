import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[runtime] Table.length', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Table.length).toBeDefined();
  });
});

Vitest.describe('[types] Table.length', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Table.length;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
