import { describe, expect, it } from "vitest";
import * as Macro from "..";
import { Mapper } from "../../function";

describe("Macro.dualify [runtime]", () => {
  describe("with no tail", () => {
    it("should correctly handle 0 arity (with no tail)", () => {
      const operator: {
        (self: number): number;
        (): (self: number) => number;
      } = Macro.dualify(0, (self: number) => self + 2);

      const input = 10;
      const expected = 12;

      const output = operator(input);
      expect(typeof output).toBe("number");
      expect(output).toBe(expected);

      const resolver = operator();
      expect(typeof resolver).toBe("function");

      const output2 = resolver(input);
      expect(typeof output2).toBe("number");
      expect(output2).toBe(expected);
    });

    it("should correctly handle 1 arity (with no tail)", () => {
      const operator: {
        (self: number, fn: Mapper<number, number>): number;
        (fn: Mapper<number, number>): (self: number) => number;
      } = Macro.dualify(1, (self: number, fn: Mapper<number, number>) => fn(self));

      const mapper: Mapper<number, number> = x => x * 2;
      const input = 10;
      const expected = mapper(input);

      const output = operator(input, mapper);
      expect(typeof output).toBe("number");
      expect(output).toBe(expected);

      const resolver = operator(mapper);
      expect(typeof resolver).toBe("function");

      const output2 = resolver(input);
      expect(typeof output2).toBe("number");
      expect(output2).toBe(expected);
    });

    it("should correctly handle 2 arity (with no tail)", () => {
      const operator: {
        (self: number, f: Mapper<number, number>, g: Mapper<number, number>): number;
        (f: Mapper<number, number>, g: Mapper<number, number>): (self: number) => number;
      } = Macro.dualify(
        2,
        (self: number, f: Mapper<number, number>, g: Mapper<number, number>) => g(f(self))
      );

      const f: Mapper<number, number> = x => x + 5;
      const g: Mapper<number, number> = y => y * 2;

      const input = 4;
      const expected = g(f(input));

      const output = operator(input, f, g);
      expect(typeof output).toBe("number");
      expect(output).toBe(expected);

      const resolver = operator(f, g);
      expect(typeof resolver).toBe("function");

      const output2 = resolver(input);
      expect(typeof output2).toBe("number");
      expect(output2).toBe(expected);
    });
  });

  describe("with tail", () => {
    const isSelf = (x: unknown): x is number => typeof x === "number";

    it("should correctly handle 0 arity (with tail)", () => {
      const operator: {
        (self: number, tail: string): number;
        (tail: string): (self: number) => number;
      } = Macro.dualify(
        0,
        (self: number, tail: string) => {
          if (tail === "increment") return self + 1;
          return self;
        },
        { withTail: true, isSelf }
      );

      const input = 10;
      const tail = "increment";
      const expected = 11;

      const output = operator(input, tail);
      expect(typeof output).toBe("number");
      expect(output).toBe(expected);

      const resolver = operator(tail);
      expect(typeof resolver).toBe("function");

      const output2 = resolver(input);
      expect(typeof output2).toBe("number");
      expect(output2).toBe(expected);
    });

    it("should correctly handle 1 arity (with tail)", () => {
      const operator: {
        (self: number, fn: Mapper<number, number>, tail: string): number;
        (fn: Mapper<number, number>, tail: string): (self: number) => number;
      } = Macro.dualify(
        1,
        (self: number, fn: Mapper<number, number>, tail: string) => {
          if (tail === "apply") return fn(self);
          return self;
        },
        { withTail: true, isSelf }
      );

      const mapper: Mapper<number, number> = x => x * 2;
      const input = 10;
      const tail = "apply";
      const expected = mapper(input);

      const output = operator(input, mapper, tail);
      expect(typeof output).toBe("number");
      expect(output).toBe(expected);

      const resolver = operator(mapper, tail);
      expect(typeof resolver).toBe("function");

      const output2 = resolver(input);
      expect(typeof output2).toBe("number");
      expect(output2).toBe(expected);
    });

    it("should correctly handle 2 arity (with tail)", () => {
      const operator: {
        (
          self: number,
          f: Mapper<number, number>,
          g: Mapper<number, number>,
          tail: string
        ): number;
        (
          f: Mapper<number, number>,
          g: Mapper<number, number>,
          tail: string
        ): (self: number) => number;
      } = Macro.dualify(
        2,
        (self: number, f: Mapper<number, number>, g: Mapper<number, number>, tail: string) => {
          if (tail === "compose") return g(f(self));
          return self;
        },
        { withTail: true, isSelf }
      );

      const f: Mapper<number, number> = x => x + 5;
      const g: Mapper<number, number> = y => y * 2;
      const input = 4;
      const tail = "compose";
      const expected = g(f(input));

      const output = operator(input, f, g, tail);
      expect(typeof output).toBe("number");
      expect(output).toBe(expected);

      const resolver = operator(f, g, tail);
      expect(typeof resolver).toBe("function");

      const output2 = resolver(input);
      expect(typeof output2).toBe("number");
      expect(output2).toBe(expected);
    });
  });
});
