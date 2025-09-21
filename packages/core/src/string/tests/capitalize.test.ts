import * as Vitest from "vitest";

import * as String from "../index.js";

Vitest.describe("[runtime] String.capitalize", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(String.capitalize).toBeDefined();
  });

  Vitest.it("should capitalize the first letter of each word in a single word string", () => {
    Vitest.expect(String.capitalize("hello")).toBe("Hello");
  });

  Vitest.it("should capitalize the first letter of each word in a multi-word string", () => {
    Vitest.expect(String.capitalize("hello world")).toBe("Hello World");
  });

  Vitest.it("should handle strings with mixed casing correctly", () => {
    Vitest.expect(String.capitalize("hElLo WoRLd")).toBe("Hello World");
  });

  Vitest.it("should handle strings with extra spaces", () => {
    Vitest.expect(String.capitalize("   hello   world   ")).toBe("   Hello   World   ");
  });

  Vitest.it("should return an empty string if input is empty", () => {
    Vitest.expect(String.capitalize("")).toBe("");
  });

  Vitest.it("should handle strings with only one character", () => {
    Vitest.expect(String.capitalize("a")).toBe("A");
    Vitest.expect(String.capitalize("A")).toBe("A");
  });

  Vitest.it("should handle special characters correctly", () => {
    Vitest.expect(String.capitalize("hello-world")).toBe("Hello-world");
    Vitest.expect(String.capitalize("this is a test!")).toBe("This Is A Test!");
  });
});

Vitest.describe("[types] String.capitalize", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof String.capitalize;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
