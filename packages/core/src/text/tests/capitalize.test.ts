import * as Vitest from "vitest";

import * as Text from "../index.js";

Vitest.describe("[runtime] Text.capitalize", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Text.capitalize).toBeDefined();
  });

  Vitest.it("should capitalize the first letter of each word in a single word string", () => {
    Vitest.expect(Text.capitalize("hello")).toBe("Hello");
  });

  Vitest.it("should capitalize the first letter of each word in a multi-word string", () => {
    Vitest.expect(Text.capitalize("hello world")).toBe("Hello World");
  });

  Vitest.it("should handle strings with mixed casing correctly", () => {
    Vitest.expect(Text.capitalize("hElLo WoRLd")).toBe("Hello World");
  });

  Vitest.it("should handle strings with extra spaces", () => {
    Vitest.expect(Text.capitalize("   hello   world   ")).toBe("   Hello   World   ");
  });

  Vitest.it("should return an empty string if input is empty", () => {
    Vitest.expect(Text.capitalize("")).toBe("");
  });

  Vitest.it("should handle strings with only one character", () => {
    Vitest.expect(Text.capitalize("a")).toBe("A");
    Vitest.expect(Text.capitalize("A")).toBe("A");
  });

  Vitest.it("should handle special characters correctly", () => {
    Vitest.expect(Text.capitalize("hello-world")).toBe("Hello-world");
    Vitest.expect(Text.capitalize("this is a test!")).toBe("This Is A Test!");
  });
});

Vitest.describe("[types] Text.capitalize", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Text.capitalize;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
