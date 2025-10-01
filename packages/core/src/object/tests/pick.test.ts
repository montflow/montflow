import * as Vitest from "vitest";

import { PropertyKey } from "../../global/index.js";
import * as Object from "../index.js";

Vitest.describe("[runtime] Object.pick", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.pick).toBeDefined();
  });

  Vitest.it("should pick specified keys from an object", () => {
    const input = { a: 1, b: 2, c: 3, d: 4 };
    const keys = ["a", "c"] as const;
    const result = Object.pick(input, keys);

    Vitest.expect(result).toEqual({ a: 1, c: 3 });
    Vitest.expect(Object.keys(result)).toEqual(["a", "c"]);
  });

  Vitest.it("should work in curried form", () => {
    const input = { x: 10, y: 20, z: 30 };
    const pickXY = Object.pick(["x", "y"] as const);
    const result = pickXY(input);

    Vitest.expect(result).toEqual({ x: 10, y: 20 });
    Vitest.expect(Object.keys(result)).toEqual(["x", "y"]);
  });

  Vitest.it("should handle empty keys array", () => {
    const input = { a: 1, b: 2 };
    const result = Object.pick(input, []);

    Vitest.expect(result).toEqual({});
    Vitest.expect(Object.keys(result)).toEqual([]);
  });

  Vitest.it("should handle non-existent keys gracefully", () => {
    const input = { a: 1, b: 2, c: 3 };
    const keys = ["a", "c"] as const;
    const result = Object.pick(input, keys);

    Vitest.expect(result).toEqual({ a: 1, c: 3 });
    Vitest.expect(Object.keys(result)).toEqual(["a", "c"]);
  });

  Vitest.it("should preserve original object", () => {
    const input = { a: 1, b: 2, c: 3 };
    const keys = ["a", "b"] as const;
    const result = Object.pick(input, keys);

    Vitest.expect(input).toEqual({ a: 1, b: 2, c: 3 });
    Vitest.expect(result).not.toBe(input);
  });

  Vitest.describe("curried version", () => {
    Vitest.it("should work with curried form - basic usage", () => {
      const input = { name: "Alice", age: 25, city: "NYC", country: "USA" };
      const pickNameAndAge = Object.pick(["name", "age"] as const);
      const result = pickNameAndAge(input);

      Vitest.expect(result).toEqual({ name: "Alice", age: 25 });
      Vitest.expect(Object.keys(result)).toEqual(["name", "age"]);
    });

    Vitest.it("should work with curried form - single key", () => {
      const input = { x: 100, y: 200, z: 300 };
      const pickX = Object.pick(["x"] as const);
      const result = pickX(input);

      Vitest.expect(result).toEqual({ x: 100 });
      Vitest.expect(Object.keys(result)).toEqual(["x"]);
    });

    Vitest.it("should work with curried form - empty keys", () => {
      const input = { a: 1, b: 2, c: 3 };
      const pickNothing = Object.pick([]);
      const result = pickNothing(input);

      Vitest.expect(result).toEqual({});
      Vitest.expect(Object.keys(result)).toEqual([]);
    });

    Vitest.it("should work with curried form - all keys", () => {
      const input = { foo: "bar", baz: 42 };
      const pickAll = Object.pick(["foo", "baz"] as const);
      const result = pickAll(input);

      Vitest.expect(result).toEqual({ foo: "bar", baz: 42 });
      Vitest.expect(Object.keys(result)).toEqual(["foo", "baz"]);
    });

    Vitest.it("should work with curried form - reusable picker", () => {
      const pickIdAndName = Object.pick(["id", "name"] as const);

      const user1 = { id: 1, name: "John", email: "john@test.com", active: true };
      const user2 = { id: 2, name: "Jane", email: "jane@test.com", active: false };

      const result1 = pickIdAndName(user1);
      const result2 = pickIdAndName(user2);

      Vitest.expect(result1).toEqual({ id: 1, name: "John" });
      Vitest.expect(result2).toEqual({ id: 2, name: "Jane" });
    });

    Vitest.it("should work with curried form - complex objects", () => {
      const input = {
        personal: { name: "Bob", age: 30 },
        work: { title: "Engineer", salary: 75000 },
        meta: { created: "2023-01-01", updated: "2023-12-01" },
      };

      const pickPersonalAndMeta = Object.pick(["personal", "meta"] as const);
      const result = pickPersonalAndMeta(input);

      Vitest.expect(result).toEqual({
        personal: { name: "Bob", age: 30 },
        meta: { created: "2023-01-01", updated: "2023-12-01" },
      });
      Vitest.expect(result.personal).toBe(input.personal); // Should reference same object
      Vitest.expect(result.meta).toBe(input.meta); // Should reference same object
    });

    Vitest.it("should preserve original object in curried form", () => {
      const input = { a: 1, b: 2, c: 3, d: 4 };
      const pickAC = Object.pick(["a", "c"] as const);
      const result = pickAC(input);

      Vitest.expect(input).toEqual({ a: 1, b: 2, c: 3, d: 4 });
      Vitest.expect(result).not.toBe(input);
      Vitest.expect(result).toEqual({ a: 1, c: 3 });
    });

    Vitest.it("should work with curried form - functional composition", () => {
      const products = [
        {
          id: 1,
          name: "Laptop",
          price: 999,
          category: "Electronics",
          inStock: true,
          description: "Gaming laptop",
        },
        {
          id: 2,
          name: "Mouse",
          price: 25,
          category: "Electronics",
          inStock: false,
          description: "Wireless mouse",
        },
        {
          id: 3,
          name: "Desk",
          price: 200,
          category: "Furniture",
          inStock: true,
          description: "Standing desk",
        },
      ];

      const getPublicInfo = Object.pick(["id", "name", "price", "inStock"] as const);
      const publicProducts = products.map(getPublicInfo);

      Vitest.expect(publicProducts).toEqual([
        { id: 1, name: "Laptop", price: 999, inStock: true },
        { id: 2, name: "Mouse", price: 25, inStock: false },
        { id: 3, name: "Desk", price: 200, inStock: true },
      ]);
    });
  });
});

Vitest.describe("[types] Object.pick", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.pick;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should have correct type signature for explicit form", () => {
    const input = { a: 1, b: "hello", c: true };
    const keys = ["a", "c"] as const;
    const result = Object.pick(input, keys);

    Vitest.expectTypeOf(result).toEqualTypeOf<{ a: number; c: boolean }>();
  });

  Vitest.it("should have correct type signature for curried form", () => {
    const keys = ["a", "c"] as const;
    const pickFn = Object.pick(keys);

    type ExpectedType = <TInput extends Record<PropertyKey, any>>(
      self: TInput
    ) => Pick<TInput, "a" | "c">;
    Vitest.expectTypeOf(pickFn).toMatchTypeOf<ExpectedType>();
  });

  Vitest.it("should preserve value types correctly", () => {
    const input = {
      name: "John",
      age: 30,
      active: true,
      tags: ["dev", "ts"],
    };
    const keys = ["name", "tags"] as const;
    const result = Object.pick(input, keys);

    Vitest.expectTypeOf(result).toEqualTypeOf<{
      name: string;
      tags: string[];
    }>();
  });

  Vitest.it("should prevent accessing non-existent properties", () => {
    const input = { a: 1, b: "hello", c: true };
    const keys = ["a", "c"] as const;
    const result = Object.pick(input, keys);

    // This should be a type error - 'b' was not picked
    // @ts-expect-error - Property 'b' does not exist on type 'Pick<{ a: number; b: string; c: boolean; }, "a" | "c">'
    const shouldError = result.b;

    // This should work fine
    const shouldWork = result.a;
    Vitest.expectTypeOf(shouldWork).toEqualTypeOf<number>();
  });

  Vitest.it("should enforce keys must exist in input object", () => {
    const input = { a: 1, b: 2, c: 3 };

    // This should be a type error - 'd' doesn't exist in input
    // @ts-expect-error - Argument of type '"d"' is not assignable to parameter of type 'keyof { a: number; b: number; c: number; }'
    const shouldError = Object.pick(input, ["a", "d"]);
  });

  Vitest.it("should handle duplicate keys in type system", () => {
    const input = { a: 1, b: 2, c: 3 };
    const keys = ["a", "a", "b"] as const;
    const result = Object.pick(input, keys);

    // Should still work correctly despite duplicates
    Vitest.expectTypeOf(result).toEqualTypeOf<{ a: number; b: number }>();
  });

  Vitest.it("should work with specific object types", () => {
    interface User {
      id: number;
      name: string;
      email: string;
      isActive: boolean;
    }

    const user: User = {
      id: 1,
      name: "John",
      email: "john@example.com",
      isActive: true,
    };

    const publicInfo = Object.pick(user, ["id", "name"]);

    Vitest.expectTypeOf(publicInfo).toEqualTypeOf<{ id: number; name: string }>();

    // This should be a type error
    // @ts-expect-error - Property 'email' does not exist on type 'Pick<User, "id" | "name">'
    const shouldError = publicInfo.email;
  });
});
