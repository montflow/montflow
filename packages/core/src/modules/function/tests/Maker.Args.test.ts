import * as Vitest from 'vitest';

import * as Function from '../index.js';

type Example = Function.Maker<{ x: number }, [string, number]>;

Vitest.describe('[types] Function.Maker.Args', () => {
  Vitest.it('should be defined', () => {
    type Test = Function.Maker.Args<Example>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
