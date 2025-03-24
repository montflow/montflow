import { Function } from "@montflow/core";
import type * as Vitest from "vitest";

export const state = ({ describe, expect }: typeof Vitest, Module: any) => {
  describe("State module", it => {
    it(`should have a function "make"`, () => {
      expect(Module).toHaveProperty("make");
      expect(Function.isFunction(Module.make)).toBe(true);
    });

    it(`should have a function "readonly"`, () => {
      expect(Module).toHaveProperty("readonly");
      expect(Function.isFunction(Module.readonly)).toBe(true);
    });
  });
  describe("State module", it => {
    it(`should have a function "make"`, () => {
      expect(Module).toHaveProperty("make");
      expect(Function.isFunction(Module.make)).toBe(true);
    });

    it(`should have a function "readonly"`, () => {
      expect(Module).toHaveProperty("readonly");
      expect(Function.isFunction(Module.readonly)).toBe(true);
    });
  });
};
