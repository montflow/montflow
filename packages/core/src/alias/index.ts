/**
 * Type alias for the global Promise type.
 * @template T The type of the value that the Promise resolves to
 */
export type Promise<T> = globalThis.Promise<T>;
