import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[runtime] Table.values', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Table.values).toBeDefined();
  });
});

Vitest.describe('[types] Table.values', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Table.values;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe('[types] Table.Values', () => {
  Vitest.it('should be defined', () => {
    type Test = Table.Values<{ a: number; b: string }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
