import * as Vitest from "vitest";

import * as Macro from "../index.js";

Vitest.describe("[runtime] Macro.OnceAlreadyExistsError", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Macro.OnceAlreadyExistsError).toBeDefined();
  });

  Vitest.it("should be an Error", () => {
    const error = new Macro.OnceAlreadyExistsError("test-id");
    Vitest.expect(error).toBeInstanceOf(Error);
  });

  Vitest.it("should have correct message", () => {
    const error = new Macro.OnceAlreadyExistsError("test-id");
    Vitest.expect(error.message).toBe("Once function with id test-id already exists");
  });
});

Vitest.describe("[types] Macro.OnceAlreadyExistsError", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Macro.OnceAlreadyExistsError;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});

