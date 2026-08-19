/**
 * @todo documentation
 * @todo testing
 */
export const isIterable = <T>(value: unknown): value is Iterable<T> =>
  // SAFETY: the guard first checks value is non-null, so the cast only
  // reaches the Symbol.iterator probe on an object value.
  value != null && typeof (value as any)[Symbol.iterator] === 'function';
