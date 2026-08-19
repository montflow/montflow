import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[types] Table.IsEmpty', () => {
  Vitest.it('should be defined', () => {
    type Test = Table.IsEmpty<{}>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
