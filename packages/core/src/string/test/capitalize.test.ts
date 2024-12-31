import { describe, expect, test } from "vitest";
import { capitalize } from "..";

describe("[runtime] capitalize", () => {
  test("should capitalize the first letter of each word in a single word string", () => {
    expect(capitalize("hello")).toBe("Hello");
  });

  test("should capitalize the first letter of each word in a multi-word string", () => {
    expect(capitalize("hello world")).toBe("Hello World");
  });

  test("should handle strings with mixed casing correctly", () => {
    expect(capitalize("hElLo WoRLd")).toBe("Hello World");
  });

  test("should handle strings with extra spaces", () => {
    expect(capitalize("   hello   world   ")).toBe("   Hello   World   ");
  });

  test("should return an empty string if input is empty", () => {
    expect(capitalize("")).toBe("");
  });

  test("should handle strings with only one character", () => {
    expect(capitalize("a")).toBe("A");
    expect(capitalize("A")).toBe("A");
  });

  test("should handle special characters correctly", () => {
    expect(capitalize("hello-world")).toBe("Hello-world");
    expect(capitalize("this is a test!")).toBe("This Is A Test!");
  });
});
