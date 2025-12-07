import * as Vitest from "vitest";

import * as Table from "../index.js";

Vitest.describe("[runtime] Table.flatten", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Table.flatten).toBeDefined();
  });

  Vitest.it("should flatten a simple nested object", () => {
    const obj = { a: 1, b: { x: 10 } };
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({ a: 1, "b.x": 10 });
  });

  Vitest.it("should flatten an object with numeric keys", () => {
    const obj = { a: 1, b: { 1: 10, 2: false } } as const;
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({ a: 1, "b.1": 10, "b.2": false });
  });

  Vitest.it("should flatten arrays using numeric indices", () => {
    const obj = { c: [1, 2, 3] } as const;
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({ "c.0": 1, "c.1": 2, "c.2": 3 });
  });

  Vitest.it("should flatten deeply nested objects", () => {
    const obj = { a: { b: { c: { d: 42 } } } };
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({ "a.b.c.d": 42 });
  });

  Vitest.it("should handle mixed nested structures", () => {
    const obj = {
      a: 1,
      b: { 1: 10, 2: false },
      c: [1, 2, 3],
    } as const;
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({
      a: 1,
      "b.1": 10,
      "b.2": false,
      "c.0": 1,
      "c.1": 2,
      "c.2": 3,
    });
  });

  Vitest.it("should handle empty objects", () => {
    const obj = {};
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({});
  });

  Vitest.it("should handle null values as primitives", () => {
    const obj = { a: null, b: { x: null } };
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({ a: null, "b.x": null });
  });

  Vitest.it("should handle Date objects as primitives", () => {
    const date = new Date("2024-01-01");
    const obj = { a: date, b: { x: date } };
    const result = Table.flatten(obj);
    Vitest.expect(result).toEqual({ a: date, "b.x": date });
  });

  Vitest.it("should exclude array methods like length, push, etc.", () => {
    const obj = { a: [1, 2, 3] } as const;
    const result = Table.flatten(obj);
    // Should only have numeric indices, not length or array methods
    Vitest.expect(result).toEqual({ "a.0": 1, "a.1": 2, "a.2": 3 });
    Vitest.expect(result).not.toHaveProperty("a.length");
    Vitest.expect(result).not.toHaveProperty("a.push");
  });

  Vitest.it("should exclude function methods like apply, call, etc.", () => {
    const fn = () => {};
    const obj = { a: fn };
    const result = Table.flatten(obj);
    // Functions should be treated as primitives, not recursed into
    Vitest.expect(result).toEqual({ a: fn });
    // Should not have flattened function properties as separate string keys
    const keys = Object.keys(result);
    Vitest.expect(keys).not.toContain("a.apply");
    Vitest.expect(keys).not.toContain("a.call");
    Vitest.expect(keys).not.toContain("a.bind");
    // Should only have the function itself as a key
    Vitest.expect(keys).toEqual(["a"]);
  });
});

Vitest.describe("[types] Table.flatten", () => {
  Vitest.it("should be defined", () => {
    // Skip type check for function definition to avoid deep type instantiation with Flatten<TObject>
    // The function's type is verified through its usage in other tests below
    Vitest.expect(Table.flatten).toBeDefined();
  });

  Vitest.it("should produce correct types for simple nested objects", () => {
    const obj = { a: 1, b: { x: 10 } } as const;
    const result = Table.flatten(obj);
    Vitest.expectTypeOf(result).toEqualTypeOf<{ a: 1; "b.x": 10 }>();
  });

  Vitest.it(
    "should produce correct types for objects with numeric keys",
    () => {
      const obj = { a: 1, b: { 1: 10, 2: false } } as const;
      const result = Table.flatten(obj);
      Vitest.expectTypeOf(result).toEqualTypeOf<{
        a: 1;
        "b.1": 10;
        "b.2": false;
      }>();
    }
  );

  Vitest.it("should produce correct types for arrays", () => {
    const obj = { c: [1, 2, 3] } as const;
    const result = Table.flatten(obj);
    Vitest.expectTypeOf(result).toEqualTypeOf<{
      "c.0": 1;
      "c.1": 2;
      "c.2": 3;
    }>();
  });

  Vitest.it("should produce correct types for mixed structures", () => {
    const obj = {
      a: 1,
      b: { 1: 10, 2: false },
      c: [1, 2, 3],
    } as const;
    const result = Table.flatten(obj);
    Vitest.expectTypeOf(result).toEqualTypeOf<{
      a: 1;
      "b.1": 10;
      "b.2": false;
      "c.0": 1;
      "c.1": 2;
      "c.2": 3;
    }>();
  });
});

Vitest.describe("[types] Table.Flatten", () => {
  Vitest.it("should be defined", () => {
    type Test = Table.Flatten<{ a: 1 }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should flatten nested object types", () => {
    type Input = { a: 1; b: { x: 10; y: false } };
    type Output = Table.Flatten<Input>;
    Vitest.expectTypeOf<Output>().toEqualTypeOf<{
      a: 1;
      "b.x": 10;
      "b.y": false;
    }>();
  });

  Vitest.it("should flatten tuple types with numeric indices", () => {
    type Input = { c: readonly [1, 2, 3] };
    type Output = Table.Flatten<Input>;
    Vitest.expectTypeOf<Output>().toEqualTypeOf<{
      "c.0": 1;
      "c.1": 2;
      "c.2": 3;
    }>();
  });

  Vitest.it("should exclude array methods from flattened types", () => {
    type Input = { a: [1, 2, 3]; b: { x: 10; y: [1, 2, 3] } };
    type Output = Table.Flatten<Input>;
    // Should only have numeric indices, not array methods
    Vitest.expectTypeOf<Output>().toEqualTypeOf<{
      "a.0": 1;
      "a.1": 2;
      "a.2": 3;
      "b.x": 10;
      "b.y.0": 1;
      "b.y.1": 2;
      "b.y.2": 3;
    }>();
  });
});
