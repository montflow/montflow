import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.keys", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.keys).toBeDefined();
  });
});

Vitest.describe("[types] Object.keys", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.keys;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

Vitest.describe("[types] Object.Keys", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.Keys<{ a: number; b: string }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
