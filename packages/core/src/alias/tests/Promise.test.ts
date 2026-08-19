import * as Vitest from 'vitest';

import * as Alias from '../index.js';

Vitest.describe('[types] Alias.Promise', () => {
  Vitest.it('should be defined', () => {
    type Test = Alias.Promise<any>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should be assignable to globalThis.Promise', () => {
    type Test = Alias.Promise<string>;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<globalThis.Promise<string>>();
  });

  Vitest.it('should accept any type parameter', () => {
    type StringPromise = Alias.Promise<string>;
    type NumberPromise = Alias.Promise<number>;
    type ObjectPromise = Alias.Promise<{ foo: string }>;

    Vitest.expectTypeOf<StringPromise>().toEqualTypeOf<globalThis.Promise<string>>();
    Vitest.expectTypeOf<NumberPromise>().toEqualTypeOf<globalThis.Promise<number>>();
    Vitest.expectTypeOf<ObjectPromise>().toEqualTypeOf<globalThis.Promise<{ foo: string }>>();
  });

  Vitest.it('should preserve Promise methods and properties', () => {
    type Test = Alias.Promise<string>;

    Vitest.expectTypeOf<Test['then']>().not.toEqualTypeOf<undefined>();
    Vitest.expectTypeOf<Test['catch']>().not.toEqualTypeOf<undefined>();
    Vitest.expectTypeOf<Test['finally']>().not.toEqualTypeOf<undefined>();
  });
});
