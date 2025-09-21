import * as Vitest from "vitest";

import * as Maybe from "../../maybe/index.js";
import * as Array from "../index.js";

Vitest.describe.concurrent("[runtime] Array.checkNotEmpty", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Array.checkNotEmpty).toBeDefined();
  });

  Vitest.it.concurrent("should return Some with non-empty array for non-empty inputs", () => {
    const initial = [1, 2, 3];
    const value = Array.checkNotEmpty(initial);

    Vitest.expect(value).toHaveProperty("_id", "some");
    Vitest.expect(value).toHaveProperty("value", initial);
  });

  Vitest.it.concurrent("should return None for empty array inputs", () => {
    const empty: number[] = [];
    const value = Array.checkNotEmpty(empty);

    Vitest.expect(value).toHaveProperty("_id", "none");
  });

  Vitest.it.concurrent("should work with different array types", () => {
    const strings = ["a", "b", "c"];
    const objects = [{ id: 1 }, { id: 2 }];

    Vitest.expect(Array.checkNotEmpty(strings)).toHaveProperty("_id", "some");
    Vitest.expect(Array.checkNotEmpty(objects)).toHaveProperty("_id", "some");
    Vitest.expect(Array.checkNotEmpty([])).toHaveProperty("_id", "none");
  });
});

Vitest.describe("[types] Array.checkNotEmpty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.checkNotEmpty;

    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should return Maybe of NotEmpty type", () => {
    const arr = [1, 2, 3];
    const value = Array.checkNotEmpty(arr);

    type Test = typeof value;
    type Expected = Maybe.Maybe<Array.NotEmpty<number>>;

    Vitest.expectTypeOf<Test>().toEqualTypeOf<Expected>();
  });
});
