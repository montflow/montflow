import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.values", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.values).toBeDefined();
  });
});

Vitest.describe("[types] Object.values", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.values;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Object.Values", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.Values<{ a: number; b: string }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
