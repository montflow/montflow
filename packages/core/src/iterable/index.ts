export function isIterable<T>(value: unknown): value is Iterable<T> {
  return value != null && typeof (value as any)[Symbol.iterator] === "function";
}
