import * as Vitest from "vitest";

/**
 * Helper function to assert elapsed time with tolerance for CI environments
 * @param elapsed - The actual elapsed time in milliseconds
 * @param expected - The expected minimum time in milliseconds
 * @param tolerance - The tolerance in milliseconds (default: 1ms)
 */
export const expectElapsedTimeWithTolerance = (
  elapsed: number,
  expected: number,
  tolerance: number = 1
) => {
  Vitest.expect(elapsed).toBeGreaterThanOrEqual(expected - tolerance);
};
