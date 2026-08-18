import * as Vitest from "vitest";

import * as Table from "../index.js";

Vitest.describe("[runtime] Table.isTable", () => {
  Vitest.it("should be defined", () => {
    Vitest.expect(Table.isTable).toBeDefined();
  });
});

Vitest.describe("[types] Table.isTable", () => {
  Vitest.it("should be defined", () => {
    type Test = typeof Table.isTable;
    Vitest.expectTypeOf<Test>().not.toEqualTypeOf<undefined>();
  });
});
