import * as Vitest from "vitest";

import * as List from "../index.js";

Vitest.describe.concurrent("[runtime] List.filled", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(List.filled).toBeDefined();
  });

  Vitest.it.concurrent(
    "should create array with specified length and static value",
    () => {
      const result = List.filled(3, "hello");
      Vitest.expect(result).toEqual(["hello", "hello", "hello"]);
      Vitest.expect(result.length).toBe(3);
    }
  );

  Vitest.it.concurrent("should create empty array when length is 0", () => {
    const result = List.filled(0, "value");
    Vitest.expect(result).toEqual([]);
    Vitest.expect(result.length).toBe(0);
  });

  Vitest.it.concurrent("should work with different value types", () => {
    const numbers = List.filled(2, 42);
    const objects = List.filled(2, { id: 1 });
    const booleans = List.filled(3, true);

    Vitest.expect(numbers).toEqual([42, 42]);
    Vitest.expect(objects).toEqual([{ id: 1 }, { id: 1 }]);
    Vitest.expect(booleans).toEqual([true, true, true]);
  });

  Vitest.it.concurrent("should work with function values (Evaluable)", () => {
    const result = List.filled(3, () => Math.random());

    Vitest.expect(result.length).toBe(3);
    // Each element should be a different random number
    Vitest.expect(result[0]).not.toBe(result[1]);
    Vitest.expect(result[1]).not.toBe(result[2]);
    Vitest.expect(typeof result[0]).toBe("number");
  });

  Vitest.it.concurrent(
    "should work with function values that return different types",
    () => {
      let counter = 0;
      const result = List.filled(3, () => ++counter);

      Vitest.expect(result).toEqual([1, 2, 3]);
    }
  );

  Vitest.it.concurrent(
    "should work with function values returning objects",
    () => {
      let id = 0;
      const result = List.filled(2, () => ({ id: ++id, name: `item${id}` }));

      Vitest.expect(result).toEqual([
        { id: 1, name: "item1" },
        { id: 2, name: "item2" },
      ]);
    }
  );

  Vitest.it.concurrent("should handle null and undefined values", () => {
    const nullArray = List.filled(2, null);
    const undefinedArray = List.filled(2, undefined);

    Vitest.expect(nullArray).toEqual([null, null]);
    Vitest.expect(undefinedArray).toEqual([undefined, undefined]);
  });

  Vitest.it.concurrent("should create new array instances", () => {
    const first = List.filled(2, "test");
    const second = List.filled(2, "test");

    Vitest.expect(first).not.toBe(second);
    Vitest.expect(first).toEqual(second);
  });

  Vitest.it.concurrent("should work with large lengths", () => {
    const result = List.filled(1000, "x");

    Vitest.expect(result.length).toBe(1000);
    Vitest.expect(result.every((item) => item === "x")).toBe(true);
  });
});

Vitest.describe("[types] List.filled", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof List.filled;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should accept length and Evaluable<T> and return Array<T>", () => {
    type Test = typeof List.filled;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<
      <T>(length: number, value: T | (() => T)) => Array<T>
    >();
  });

  Vitest.it("should infer correct types when used", () => {
    const stringArray = List.filled(3, "hello");
    const numberArray = List.filled(3, 42);
    const functionArray = List.filled(3, () => "dynamic");

    Vitest.expectTypeOf(stringArray).toEqualTypeOf<Array<string>>();
    Vitest.expectTypeOf(numberArray).toEqualTypeOf<Array<number>>();
    Vitest.expectTypeOf(functionArray).toEqualTypeOf<Array<string>>();
  });
});
