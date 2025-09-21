import * as Vitest from "vitest";

import * as Object from "../index.js";

Vitest.describe("[runtime] Object.entries", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Object.entries).toBeDefined();
  });

  Vitest.it("should extract entries in data-first overload", () => {
    const obj = { prop1: "🎈", prop2: 0x0, prop3: true };

    const result = Object.entries(obj);

    Vitest.expect(result).toStrictEqual([
      ["prop1", "🎈"],
      ["prop2", 0x0],
      ["prop3", true],
    ]);
  });
});

Vitest.describe("[types] Object.entries", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Object.entries;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should correctly infer the output type of array", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true };
    const result = Object.entries(input);

    type Test = typeof result;
    type Expected = (["hello", string] | ["world", number] | ["!", boolean])[];

    Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });

  Vitest.it("should correctly infer the output type of array for const objects", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    const result = Object.entries(input);

    type Test = typeof result;
    type Expected = (["hello", "🎈"] | ["world", 0x0] | ["!", true])[];

    Vitest.expectTypeOf<Test>().toMatchTypeOf<Expected>();
  });
});

Vitest.describe("[types] Object.Entries", () => {
  Vitest.it("should be defined", () => {
    type Test = Object.Entries<{ a: number }>;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });

  Vitest.it("should correctly infer the entries type for a dictionary", () => {
    type Input = { hello: "🎈"; world: 0x0; ["!"]: true };
    type Result = Object.Entries<Input>;

    type Expected = ["hello", string] | ["world", number] | ["!", boolean];
    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  Vitest.it("should correctly infer the entries type for a const dictionary", () => {
    const input = { hello: "🎈", world: 0x0, ["!"]: true } as const;
    type Result = Object.Entries<typeof input>;

    type Expected = ["hello", "🎈"] | ["world", 0x0] | ["!", true];
    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  Vitest.it("should correctly infer the entries type for generic dictionary", () => {
    type Input = Record<string, number | number>;
    type Result = Object.Entries<Input>;

    type Expected = [string, number | number];
    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  Vitest.it("should handle empty objects", () => {
    const input = {};
    type Result = Object.Entries<typeof input>;

    type Expected = never;
    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });

  Vitest.it("should handle dictionaries with optional properties", () => {
    type Input = { a: number; b: string; c: boolean; d?: string[] };
    type Result = Object.Entries<Input>;

    type Expected =
      | ["a", number]
      | ["b", string]
      | ["c", boolean]
      | ["d", string[] | undefined];

    Vitest.expectTypeOf<Result>().toMatchTypeOf<Expected>();
  });
});
