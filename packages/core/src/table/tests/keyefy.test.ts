import * as Vitest from 'vitest';

import * as Table from '../index.js';

Vitest.describe('[runtime] Table.keyefy', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Table.keyefy).toBeDefined();
  });

  Vitest.it('should return a string always for the same simple input struct', () => {
    const struct = { a: 1, b: 'hello', c: true };
    const key = Table.keyefy(struct);

    Vitest.expect(typeof key).toBe('string');
  });

  Vitest.it('should return the same string for the same input always', () => {
    const struct = { a: 1, b: 'hello', c: true };
    const a = Table.keyefy(struct);
    const b = Table.keyefy(struct);

    Vitest.expect(a).toEqual(b);
  });
});

Vitest.describe('[types] Table.keyefy', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Table.keyefy;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
