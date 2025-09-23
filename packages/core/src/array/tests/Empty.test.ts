import * as Vitest from "vitest";

import * as Array from "../index.js";

Vitest.describe.concurrent("[runtime] Array.empty", () => {
  Vitest.it.concurrent("should be defined", () => {
    Vitest.expect(Array.empty).toBeDefined();
  });

  Vitest.it.concurrent("should return an empty array", () => {
    const result = Array.empty();
    Vitest.expect(result).toEqual([]);
    Vitest.expect(result.length).toBe(0);
  });

  Vitest.it.concurrent("should return a new array instance each time", () => {
    const first = Array.empty();
    const second = Array.empty();

    Vitest.expect(first).not.toBe(second);
    Vitest.expect(first).toEqual(second);
  });

  Vitest.it.concurrent("should work with different type parameters", () => {
    const numberArray = Array.empty<number>();
    const stringArray = Array.empty<string>();
    const objectArray = Array.empty<{ id: number }>();

    Vitest.expect(numberArray).toEqual([]);
    Vitest.expect(stringArray).toEqual([]);
    Vitest.expect(objectArray).toEqual([]);
  });

  Vitest.it.concurrent("should return mutable arrays", () => {
    const result = Array.empty<number>();
    result.push(1, 2, 3);

    Vitest.expect(result).toEqual([1, 2, 3]);
    Vitest.expect(result.length).toBe(3);
  });
});

Vitest.describe("[types] Array.empty", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Array.empty;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should return Array<T> for generic type T", () => {
    type Test = typeof Array.empty;
    Vitest.expectTypeOf<Test>().toEqualTypeOf<<T>() => Array<T>>();
  });

  Vitest.it("should infer correct types when used", () => {
    const numberArray = Array.empty<number>();
    const stringArray = Array.empty<string>();

    Vitest.expectTypeOf(numberArray).toEqualTypeOf<Array<number>>();
    Vitest.expectTypeOf(stringArray).toEqualTypeOf<Array<string>>();
  });
});
