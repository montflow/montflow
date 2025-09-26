import * as Vitest from "vitest";

import * as Domain from "../../domain/index.js";
import * as Maybe from "../../maybe/index.js";
import * as Array from "../index.js";

Vitest.describe.concurrent("[runtime] Array.maybeGet", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Array.maybeGet).toBeDefined();
  });

  Vitest.it.concurrent("should return Some with value for valid indices", () => {
    const arr = [1, 2, 3, 4, 5];

    const result0 = Array.maybeGet(arr, 0);
    const result2 = Array.maybeGet(arr, 2);
    const result4 = Array.maybeGet(arr, 4);

    Vitest.expect(result0).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result0).toHaveProperty("value", 1);

    Vitest.expect(result2).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result2).toHaveProperty("value", 3);

    Vitest.expect(result4).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result4).toHaveProperty("value", 5);
  });

  Vitest.it.concurrent("should return None for negative indices", () => {
    const arr = [1, 2, 3];

    const result = Array.maybeGet(arr, -1);
    Vitest.expect(result).toHaveProperty(Domain.Tag, "none");
  });

  Vitest.it.concurrent("should return None for indices beyond array length", () => {
    const arr = [1, 2, 3];

    const result = Array.maybeGet(arr, 3);
    Vitest.expect(result).toHaveProperty(Domain.Tag, "none");

    const result2 = Array.maybeGet(arr, 10);
    Vitest.expect(result2).toHaveProperty(Domain.Tag, "none");
  });

  Vitest.it.concurrent("should return None for empty arrays", () => {
    const arr: number[] = [];

    const result = Array.maybeGet(arr, 0);
    Vitest.expect(result).toHaveProperty(Domain.Tag, "none");
  });

  Vitest.it.concurrent("should work with different array types", () => {
    const strings = ["hello", "world"];
    const objects = [{ id: 1 }, { id: 2 }];
    const booleans = [true, false, true];

    const stringResult = Array.maybeGet(strings, 1);
    const objectResult = Array.maybeGet(objects, 0);
    const booleanResult = Array.maybeGet(booleans, 2);

    Vitest.expect(stringResult).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(stringResult).toHaveProperty("value", "world");

    Vitest.expect(objectResult).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(objectResult).toHaveProperty("value", { id: 1 });

    Vitest.expect(booleanResult).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(booleanResult).toHaveProperty("value", true);
  });

  Vitest.it.concurrent("should handle arrays with undefined values", () => {
    const arr = [1, undefined, 3];

    const result = Array.maybeGet(arr, 1);
    Vitest.expect(result).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result).toHaveProperty("value", undefined);
  });

  Vitest.it.concurrent("should handle arrays with null values", () => {
    const arr = [1, null, 3];

    const result = Array.maybeGet(arr, 1);
    Vitest.expect(result).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result).toHaveProperty("value", null);
  });

  Vitest.it.concurrent("should return None for non-integer indices", () => {
    const arr = [1, 2, 3];

    const result1 = Array.maybeGet(arr, 1.5);
    const result2 = Array.maybeGet(arr, 2.7);
    const result3 = Array.maybeGet(arr, NaN);
    const result4 = Array.maybeGet(arr, Infinity);
    const result5 = Array.maybeGet(arr, -Infinity);

    Vitest.expect(result1).toHaveProperty(Domain.Tag, "none");
    Vitest.expect(result2).toHaveProperty(Domain.Tag, "none");
    Vitest.expect(result3).toHaveProperty(Domain.Tag, "none");
    Vitest.expect(result4).toHaveProperty(Domain.Tag, "none");
    Vitest.expect(result5).toHaveProperty(Domain.Tag, "none");
  });

  Vitest.it.concurrent("should work with integer-like numbers", () => {
    const arr = [1, 2, 3];

    // These should work as they are integers
    const result1 = Array.maybeGet(arr, 1.0);
    const result2 = Array.maybeGet(arr, 2.0);
    const result3 = Array.maybeGet(arr, 0.0);

    Vitest.expect(result1).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result1).toHaveProperty("value", 2);

    Vitest.expect(result2).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result2).toHaveProperty("value", 3);

    Vitest.expect(result3).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result3).toHaveProperty("value", 1);
  });

  Vitest.it.concurrent("should handle sparse arrays", () => {
    const sparse = new globalThis.Array(5);
    sparse[2] = "value";

    const result0 = Array.maybeGet(sparse, 0);
    const result2 = Array.maybeGet(sparse, 2);

    Vitest.expect(result0).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result0).toHaveProperty("value", undefined);

    Vitest.expect(result2).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result2).toHaveProperty("value", "value");
  });

  Vitest.it.concurrent("should use strict bounds checking", () => {
    const arr = [1, 2, 3];

    // Test exact boundary conditions
    const resultAtLength = Array.maybeGet(arr, arr.length);
    const resultAtNegativeOne = Array.maybeGet(arr, -1);
    const resultAtZero = Array.maybeGet(arr, 0);
    const resultAtLastIndex = Array.maybeGet(arr, arr.length - 1);

    Vitest.expect(resultAtLength).toHaveProperty(Domain.Tag, "none");
    Vitest.expect(resultAtNegativeOne).toHaveProperty(Domain.Tag, "none");
    Vitest.expect(resultAtZero).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(resultAtLastIndex).toHaveProperty(Domain.Tag, "some");
  });

  Vitest.it.concurrent("should work with integer indices that are numbers", () => {
    const arr = [1, 2, 3];

    // Should work with integer values passed as numbers
    const result1 = Array.maybeGet(arr, 1);
    const result2 = Array.maybeGet(arr, 0);
    const result3 = Array.maybeGet(arr, 2);

    Vitest.expect(result1).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result1).toHaveProperty("value", 2);

    Vitest.expect(result2).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result2).toHaveProperty("value", 1);

    Vitest.expect(result3).toHaveProperty(Domain.Tag, "some");
    Vitest.expect(result3).toHaveProperty("value", 3);
  });
});

Vitest.describe("[types] Array.maybeGet", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.maybeGet;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should infer correct types when used", () => {
    const numberArray = [1, 2, 3];
    const stringArray = ["a", "b", "c"];
    const objectArray = [{ id: 1 }, { id: 2 }];

    const numberResult = Array.maybeGet(numberArray, 0);
    const stringResult = Array.maybeGet(stringArray, 1);
    const objectResult = Array.maybeGet(objectArray, 0);

    Vitest.expectTypeOf(numberResult).toEqualTypeOf<Maybe.Maybe<number>>();
    Vitest.expectTypeOf(stringResult).toEqualTypeOf<Maybe.Maybe<string>>();
    Vitest.expectTypeOf(objectResult).toEqualTypeOf<Maybe.Maybe<{ id: number }>>();
  });
});
