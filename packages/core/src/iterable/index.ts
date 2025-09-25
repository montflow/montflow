/**
 * @todo documentation
 * @todo testing
 */
export const isIterable = <T>(value: unknown): value is Iterable<T> =>
  value != null && typeof (value as any)[Symbol.iterator] === "function";
