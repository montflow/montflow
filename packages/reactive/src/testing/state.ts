import { Function } from "@montflow/core";
import type * as Vitest from "vitest";

const test = ({ describe, expect }: typeof Vitest, Module: any) => {
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

  // describe("State.make", it => {
  //   const make = Module.make as State.Module.make;

  // });

  // describe("State.readonly", it => {
  //   const readonly = Module.readonly as State.Module.readonly;
  // });
};

export default test;
