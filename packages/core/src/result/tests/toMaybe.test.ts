import * as Vitest from 'vitest';

import * as Maybe from '../../maybe/index.js';
import * as Result from '../index.js';

Vitest.describe('[runtime] Result.toMaybe', () => {
  Vitest.it('should be defined', () => {
    Vitest.expect(Result.toMaybe).toBeDefined();
  });

  Vitest.it("should turn 'Ok' into some(value)", () => {
    const maybe = Result.toMaybe(Result.ok(1));

    Vitest.expect(Maybe.isSome(maybe)).toBe(true);
    if (Maybe.isSome(maybe)) Vitest.expect(maybe.value).toBe(1);
  });

  Vitest.it("should turn 'Err' into none()", () => {
    const maybe = Result.toMaybe(Result.err('e'));

    Vitest.expect(Maybe.isNone(maybe)).toBe(true);
  });
});

Vitest.describe('[types] Result.toMaybe', () => {
  Vitest.it('should be defined', () => {
    type Test = typeof Result.toMaybe;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it('should drop the error channel', () => {
    Vitest.expectTypeOf(Result.toMaybe(Result.ok(1))).toEqualTypeOf<Maybe.Maybe<number>>();
    Vitest.expectTypeOf(Result.toMaybe(Result.err('e'))).toEqualTypeOf<Maybe.Maybe<never>>();
  });
});