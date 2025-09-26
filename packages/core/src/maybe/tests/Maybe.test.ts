import * as Vitest from "vitest";

import * as Maybe from "../index.js";

Vitest.describe("[types] Maybe.Maybe", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Maybe<number>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Maybe.Any", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Any;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Maybe.Unknown", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Unknown;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Maybe.Never", () => {
  Vitest.it("should be defined", () => {
    type Test = Maybe.Never;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
