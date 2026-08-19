import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[runtime] Table.keys', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Table.keys).toBeDefined();
  });
});

Vitest.describe('[types] Table.keys', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Table.keys;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe('[types] Table.Keys', () => {
  Vitest.it('should be defined', () => {
    type Test = Table.Keys<{ a: number; b: string }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
