import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[types] Table.Optional', () => {
  Vitest.it('should be defined', () => {
    type Test = Table.Optional<{ a: number; b: string }, 'b'>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
