import * as Function from "../function/index.js";

/**
 * @todo documentation
 * @todo testing
 */
export type Constructor<TInstance, TArguments extends readonly any[]> = new (
  ...args: TArguments
) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Args<TConstructor extends Constructor<any, any>> =
  TConstructor extends Constructor<any, infer TArgs> ? TArgs : never;

/**
 * @todo documentation
 * @todo testing
 */
export type Instance<TConstructor extends Any> =
  TConstructor extends Constructor<infer TInstance, any> ? TInstance : never;

/**
 * @todo documentation
 *
 * @todo testing
 */
export type Any = Constructor<any, any>;

/**
 * @todo documentation
 * @todo testing
 */
export type Nullary<TInstance> = new () => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Unary<TInstance, A> = new (a: A) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Binary<TInstance, A, B> = new (a: A, b: B) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Ternary<TInstance, A, B, C> = new (a: A, b: B, c: C) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Quaternary<TInstance, A, B, C, D> = new (a: A, b: B, c: C, d: D) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Quinary<TInstance, A, B, C, D, E> = new (a: A, b: B, c: C, d: D, e: E) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
// prettier-ignore
export type Senary<TInstance, A, B, C, D, E, F> = new (a: A, b: B, c: C, d: D, e: E, f: F) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
// prettier-ignore
export type Septenary<TInstance, A, B, C, D, E, F, G> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
// prettier-ignore
export type Octonary<TInstance, A, B, C, D, E, F, G, H> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
// prettier-ignore
export type Nonary<TInstance, A, B, C, D, E, F, G, H, I> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
// prettier-ignore
export type Decenary<TInstance, A, B, C, D, E, F, G, H, I, J> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export type Anyary<TInstance> = new (...args: any[]) => TInstance;

/**
 * @todo documentation
 * @todo testing
 */
export const isConstructor: {
  <TInstance extends unknown, TArgs extends readonly unknown[]>(
    thing: unknown
  ): thing is Constructor<TInstance, TArgs>;

  <TConstructor extends Any>(ctor: TConstructor): ctor is TConstructor;
} = (thing: unknown): thing is Constructor<unknown, readonly unknown[]> => {
  if (!Function.isCallable(thing)) return false;

  if (thing.prototype && thing.prototype.constructor === thing) {
    return true;
  }

  return false;
};
