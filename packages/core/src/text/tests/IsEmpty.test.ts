import * as Vitest from 'vitest';

import * as Text from '../index.js';

Vitest.describe('[runtime] Text.isEmpty', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Text.isEmpty).toBeDefined();
  });
});

Vitest.describe('[types] Text.isEmpty', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Text.isEmpty;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
