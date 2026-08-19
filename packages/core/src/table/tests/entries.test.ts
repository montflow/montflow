import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[types] Table.Entries', () => {
  Vitest.it('should be defined', () => {
    type Test = Table.Entries<{ a: string; b: number }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
