import * as Vitest from 'vitest';

import * as Text from '../index.js';

Vitest.describe('[types] Text.IsNotEmpty', () => {
  Vitest.it('should be defined', () => {
    type Test = Text.IsNotEmpty<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
