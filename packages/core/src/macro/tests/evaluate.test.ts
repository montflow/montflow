import * as Vitest from "vitest";

import * as Macro from "../index.js";
import { Evaluable } from "../../global/index.js";

Vitest.describe("[runtime] Macro.evaluate", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.evaluate).toBeDefined();
  });

  Vitest.it("should evaluate a value", () => {
    const internal = 0x0;

    const value: Evaluable<number> = internal;

    const result = Macro.evaluate(value);

    Vitest.expect(result).toBe(internal);
  });

  Vitest.it("should evaluate a function", () => {
    const internal = 0x0;

    const value: Evaluable<number> = () => internal;

    const result = Macro.evaluate(value);

    Vitest.expect(result).toBe(internal);
  });
});

Vitest.describe("[types] Macro.evaluate", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.evaluate;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
