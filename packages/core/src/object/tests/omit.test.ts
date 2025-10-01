import * as Vitest from "vitest";

import { PropertyKey } from "../../global/index.js";
import * as Object from "../index.js";

Vitest.describe("[runtime] Object.omit", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.omit).toBeDefined();
  });

  Vitest.it("should omit specified keys from an object", () => {
    const input = { a: 1, b: 2, c: 3, d: 4 };
    const keys = ["b", "d"] as const;
    const result = Object.omit(input, keys);

    Vitest.expect(result).toEqual({ a: 1, c: 3 });
    Vitest.expect(Object.keys(result)).toEqual(["a", "c"]);
  });

  Vitest.it("should work in curried form", () => {
    const input = { x: 10, y: 20, z: 30 };
    const omitY = Object.omit(["y"] as const);
    const result = omitY(input);

    Vitest.expect(result).toEqual({ x: 10, z: 30 });
    Vitest.expect(Object.keys(result)).toEqual(["x", "z"]);
  });

  Vitest.it("should handle empty keys array", () => {
    const input = { a: 1, b: 2 };
    const result = Object.omit(input, []);

    Vitest.expect(result).toEqual({ a: 1, b: 2 });
    Vitest.expect(Object.keys(result)).toEqual(["a", "b"]);
  });

  Vitest.it("should handle non-existent keys gracefully", () => {
    const input: Record<PropertyKey, any> = { a: 1, b: 2, c: 3 };
    const keys = ["b", "c", "r"] as const;
    const result = Object.omit(input, keys);

    Vitest.expect(result).toEqual({ a: 1 });
    Vitest.expect(Object.keys(result)).toEqual(["a"]);
  });

  Vitest.it("should preserve original object", () => {
    const input = { a: 1, b: 2, c: 3 };
    const keys = ["b"] as const;
    const result = Object.omit(input, keys);

    Vitest.expect(input).toEqual({ a: 1, b: 2, c: 3 });
    Vitest.expect(result).not.toBe(input);
  });

  Vitest.it("should omit all keys when all are specified", () => {
    const input = { a: 1, b: 2 };
    const keys = ["a", "b"] as const;
    const result = Object.omit(input, keys);

    Vitest.expect(result).toEqual({});
    Vitest.expect(Object.keys(result)).toEqual([]);
  });

  Vitest.describe("curried version", () => {
    Vitest.it("should work with curried form - basic usage", () => {
      const input = { name: "Alice", age: 25, city: "NYC", country: "USA" };
      const omitAgeAndCountry = Object.omit(["age", "country"] as const);
      const result = omitAgeAndCountry(input);

      Vitest.expect(result).toEqual({ name: "Alice", city: "NYC" });
      Vitest.expect(Object.keys(result)).toEqual(["name", "city"]);
    });

    Vitest.it("should work with curried form - single key", () => {
      const input = { x: 100, y: 200, z: 300 };
      const omitY = Object.omit(["y"] as const);
      const result = omitY(input);

      Vitest.expect(result).toEqual({ x: 100, z: 300 });
      Vitest.expect(Object.keys(result)).toEqual(["x", "z"]);
    });

    Vitest.it("should work with curried form - empty keys", () => {
      const input = { a: 1, b: 2, c: 3 };
      const omitNothing = Object.omit([]);
      const result = omitNothing(input);

      Vitest.expect(result).toEqual({ a: 1, b: 2, c: 3 });
      Vitest.expect(Object.keys(result)).toEqual(["a", "b", "c"]);
    });

    Vitest.it("should work with curried form - all keys", () => {
      const input = { foo: "bar", baz: 42 };
      const omitAll = Object.omit(["foo", "baz"] as const);
      const result = omitAll(input);

      Vitest.expect(result).toEqual({});
      Vitest.expect(Object.keys(result)).toEqual([]);
    });

    Vitest.it("should work with curried form - reusable omitter", () => {
      const omitSensitiveData = Object.omit(["password", "ssn"] as const);

      const user1 = {
        id: 1,
        name: "John",
        password: "secret1",
        ssn: "123-45-6789",
        email: "john@test.com",
      };
      const user2 = {
        id: 2,
        name: "Jane",
        password: "secret2",
        ssn: "987-65-4321",
        email: "jane@test.com",
      };

      const result1 = omitSensitiveData(user1);
      const result2 = omitSensitiveData(user2);

      Vitest.expect(result1).toEqual({ id: 1, name: "John", email: "john@test.com" });
      Vitest.expect(result2).toEqual({ id: 2, name: "Jane", email: "jane@test.com" });
    });

    Vitest.it("should work with curried form - complex objects", () => {
      const input = {
        personal: { name: "Bob", age: 30 },
        work: { title: "Engineer", salary: 75000 },
        meta: { created: "2023-01-01", updated: "2023-12-01" },
        internal: { debug: true, version: "1.0.0" },
      };

      const omitInternalData = Object.omit(["meta", "internal"] as const);
      const result = omitInternalData(input);

      Vitest.expect(result).toEqual({
        personal: { name: "Bob", age: 30 },
        work: { title: "Engineer", salary: 75000 },
      });
      Vitest.expect(result.personal).toBe(input.personal); // Should reference same object
      Vitest.expect(result.work).toBe(input.work); // Should reference same object
    });

    Vitest.it("should preserve original object in curried form", () => {
      const input = { a: 1, b: 2, c: 3, d: 4 };
      const omitBD = Object.omit(["b", "d"] as const);
      const result = omitBD(input);

      Vitest.expect(input).toEqual({ a: 1, b: 2, c: 3, d: 4 });
      Vitest.expect(result).not.toBe(input);
      Vitest.expect(result).toEqual({ a: 1, c: 3 });
    });

    Vitest.it("should work with curried form - functional composition", () => {
      const users = [
        { id: 1, name: "Alice", password: "pass1", role: "admin", lastLogin: "2023-01-01" },
        { id: 2, name: "Bob", password: "pass2", role: "user", lastLogin: "2023-01-02" },
        { id: 3, name: "Charlie", password: "pass3", role: "user", lastLogin: "2023-01-03" },
      ];

      const removeSecrets = Object.omit(["password", "lastLogin"] as const);
      const publicUsers = users.map(removeSecrets);

      Vitest.expect(publicUsers).toEqual([
        { id: 1, name: "Alice", role: "admin" },
        { id: 2, name: "Bob", role: "user" },
        { id: 3, name: "Charlie", role: "user" },
      ]);
    });
  });
});

Vitest.describe("[types] Object.omit", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.omit;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should have correct type signature for explicit form", () => {
    const input = { a: 1, b: "hello", c: true };
    const keys = ["b"] as const;
    const result = Object.omit(input, keys);

    Vitest.expectTypeOf(result).toEqualTypeOf<{ a: number; c: boolean }>();
  });

  Vitest.it("should have correct type signature for curried form", () => {
    const keys = ["b"] as const;
    const omitFn = Object.omit(keys);

    type ExpectedType = <TInput extends Record<PropertyKey, any>>(
      self: TInput
    ) => Omit<TInput, "b">;
    Vitest.expectTypeOf(omitFn).toMatchTypeOf<ExpectedType>();
  });

  Vitest.it("should preserve value types correctly", () => {
    const input = {
      name: "John",
      age: 30,
      active: true,
      tags: ["dev", "ts"],
    };
    const keys = ["age", "active"] as const;
    const result = Object.omit(input, keys);

    Vitest.expectTypeOf(result).toEqualTypeOf<{
      name: string;
      tags: string[];
    }>();
  });

  Vitest.it("should handle omitting all keys", () => {
    const input = { a: 1, b: 2 };
    const keys = ["a", "b"] as const;
    const result = Object.omit(input, keys);

    Vitest.expectTypeOf(result).toEqualTypeOf<{}>();
  });

  Vitest.it("should prevent accessing omitted properties", () => {
    const input = { a: 1, b: "hello", c: true };
    const keys = ["b"] as const;
    const result = Object.omit(input, keys);

    // This should be a type error - 'b' was omitted
    // @ts-expect-error - Property 'b' does not exist on type 'Omit<{ a: number; b: string; c: boolean; }, "b">'
    const shouldError = result.b;

    // These should work fine
    const shouldWork1 = result.a;
    const shouldWork2 = result.c;
    Vitest.expectTypeOf(shouldWork1).toEqualTypeOf<number>();
    Vitest.expectTypeOf(shouldWork2).toEqualTypeOf<boolean>();
  });

  Vitest.it("should enforce keys must exist in input object", () => {
    const input = { a: 1, b: 2, c: 3 };

    // This should be a type error - 'd' doesn't exist in input
    // @ts-expect-error - Argument of type '"d"' is not assignable to parameter of type 'keyof { a: number; b: number; c: number; }'
    const shouldError = Object.omit(input, ["b", "d"]);
  });

  Vitest.it("should handle duplicate keys in type system", () => {
    const input = { a: 1, b: 2, c: 3 };
    const keys = ["b", "b", "c"] as const;
    const result = Object.omit(input, keys);

    // Should still work correctly despite duplicates
    Vitest.expectTypeOf(result).toEqualTypeOf<{ a: number }>();
  });

  Vitest.it("should work with specific object types", () => {
    interface User {
      id: number;
      name: string;
      email: string;
      password: string;
      isActive: boolean;
    }

    const user: User = {
      id: 1,
      name: "John",
      email: "john@example.com",
      password: "secret",
      isActive: true,
    };

    const publicInfo = Object.omit(user, ["password"]);

    Vitest.expectTypeOf(publicInfo).toEqualTypeOf<{
      id: number;
      name: string;
      email: string;
      isActive: boolean;
    }>();

    // This should be a type error
    // @ts-expect-error - Property 'password' does not exist on type 'Omit<User, "password">'
    const shouldError = publicInfo.password;
  });

  Vitest.it("should demonstrate the original issue is fixed", () => {
    // This was the original problematic case
    const a = { a: 1, b: "hello", c: true };
    const b = Object.omit(a, ["b"]);

    // This should be a type error now
    // @ts-expect-error - Property 'b' does not exist on type 'Omit<{ a: number; b: string; c: boolean; }, "b">'
    const t = b.b;

    // But accessing existing properties should work
    const validAccess = b.a;
    Vitest.expectTypeOf(validAccess).toEqualTypeOf<number>();
  });
});
