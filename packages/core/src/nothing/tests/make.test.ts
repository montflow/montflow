import { describe, expect, it } from "vitest";
import * as Nothing from "../index.js";

describe("Nothing [runtime]", () => {
  it('should have  property prorperty `_tag` = "nothing"', () => {
    const value = Nothing.make();

    expect(value._tag).toBe("nothing");
  });
});
