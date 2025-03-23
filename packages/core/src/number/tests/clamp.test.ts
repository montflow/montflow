import { Effect, Exit } from "effect";
import { describe, expect, it } from "vitest";
import * as Number from "../../number";

describe("Number.clamp [runtime]", () => {
  it("should correctly clamp value within the range", () => {
    const value = 10;
    const range = Number.range([5, 15]);
    const expected = 10;

    const program = Number.clamp(Effect.succeed(value), range);
    const exit = Effect.runSyncExit(program);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(exit).toHaveProperty("value", expected);
  });

  it("should clamp value below the minimum to the minimum", () => {
    const value = 3;
    const range = Number.range([5, 15]);
    const expected = 5;

    const program = Number.clamp(Effect.succeed(value), range);
    const exit = Effect.runSyncExit(program);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(exit).toHaveProperty("value", expected);
  });

  it("should clamp value above the maximum to the maximum", () => {
    const value = 20;
    const range = Number.range([5, 15]);
    const expected = 15;

    const program = Number.clamp(Effect.succeed(value), range);
    const exit = Effect.runSyncExit(program);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(exit).toHaveProperty("value", expected);
  });

  it("should return an error for an invalid range", () => {
    const value = 10;
    const range = Number.range([15, 5]);

    const program = Number.clamp(Effect.succeed(value), range);
    const exit = Effect.runSyncExit(program);

    expect(Exit.isFailure(exit)).toBe(true);

    expect(exit).toHaveProperty("cause.error", new Number.InvalidRangeError());
  });

  it("should correctly clamp value using the curried version", () => {
    const value = 10;
    const range = Number.range([5, 15]);
    const expected = 10;

    const program = Effect.succeed(value).pipe(Number.clamp(range));
    const exit = Effect.runSyncExit(program);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(exit).toHaveProperty("value", expected);
  });

  it("should clamp value below the minimum using the curried version", () => {
    const value = 3;
    const range = Number.range([5, 15]);
    const expected = 5;

    const program = Effect.succeed(value).pipe(Number.clamp(range));
    const exit = Effect.runSyncExit(program);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(exit).toHaveProperty("value", expected);
  });

  it("should clamp value above the maximum using the curried version", () => {
    const value = 20;
    const range = Number.range([5, 15]);
    const expected = 15;

    const program = Effect.succeed(value).pipe(Number.clamp(range));
    const exit = Effect.runSyncExit(program);

    expect(Exit.isSuccess(exit)).toBe(true);
    expect(exit).toHaveProperty("value", expected);
  });

  it("should return an error for an invalid range using the curried version", () => {
    const value = 10;
    const range = Number.range([15, 5]);

    const program = Effect.succeed(value).pipe(Number.clamp(range));
    const exit = Effect.runSyncExit(program);

    expect(Exit.isFailure(exit)).toBe(true);
    expect(exit).toHaveProperty("cause.error", new Number.InvalidRangeError());
  });
});
