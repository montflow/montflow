import * as Function from '../function/index.js';

/**
 * Generic constructor signature
 *
 * @template TInstance instance type
 * @template TArguments arguments type
 * @returns constructor signature with the given instance and arguments types
 */
export type Constructor<TInstance, TArguments extends readonly any[]> = new (
  ...args: TArguments
) => TInstance;

/**
 * Utility type to extract the arguments type from a constructor
 *
 * @template TConstructor constructor type
 * @returns arguments type of the given constructor
 */
export type Args<TConstructor extends Constructor<any, any>> =
  TConstructor extends Constructor<any, infer TArgs> ? TArgs : never;

/**
 * Utility type to extract the instance type from a constructor
 *
 * @template TConstructor constructor type
 * @returns instance type of the given constructor
 */
export type Instance<TConstructor extends Any> =
  TConstructor extends Constructor<infer TInstance, any> ? TInstance : never;

/**
 * Constructor that can create any type with any arguments
 *
 * @alias Constructor<any, any>
 */
export type Any = Constructor<any, any>;

/**
 * Constructor that takes no arguments
 *
 * @template TInstance instance type
 * @returns constructor signature with the given instance type
 */
export type Nullary<TInstance> = new () => TInstance;

/**
 * Constructor that takes one argument
 *
 * @template TInstance instance type
 * @template A argument type
 * @returns constructor signature with the given instance and argument types
 */
export type Unary<TInstance, A> = new (a: A) => TInstance;

/**
 * Constructor that takes two arguments
 *
 * @template TInstance instance type
 * @template A argument type
 * @template B argument type
 * @returns constructor signature with the given instance and argument types
 */
export type Binary<TInstance, A, B> = new (a: A, b: B) => TInstance;

/**
 * Constructor that takes three arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @returns constructor signature with the given instance and argument types
 *
 */
export type Ternary<TInstance, A, B, C> = new (a: A, b: B, c: C) => TInstance;

/**
 * Constructor that takes four arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @returns constructor signature with the given instance and argument types
 *
 */
export type Quaternary<TInstance, A, B, C, D> = new (a: A, b: B, c: C, d: D) => TInstance;

/**
 * Constructor that takes five arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @template E fifth argument type
 * @returns constructor signature with the given instance and argument types
 */
export type Quinary<TInstance, A, B, C, D, E> = new (a: A, b: B, c: C, d: D, e: E) => TInstance;

/**
 * Constructor that takes six arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @template E fifth argument type
 * @template F sixth argument type
 * @returns constructor signature with the given instance and argument types
 */
// prettier-ignore
export type Senary<TInstance, A, B, C, D, E, F> = new (a: A, b: B, c: C, d: D, e: E, f: F) => TInstance;

/**
 * Constructor that takes seven arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @template E fifth argument type
 * @template F sixth argument type
 * @template G seventh argument type
 * @returns constructor signature with the given instance and argument types
 */
// prettier-ignore
export type Septenary<TInstance, A, B, C, D, E, F, G> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G) => TInstance;

/**
 * Constructor that takes eight arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @template E fifth argument type
 * @template F sixth argument type
 * @template G seventh argument type
 * @template H eighth argument type
 * @returns constructor signature with the given instance and argument types
 */
// prettier-ignore
export type Octonary<TInstance, A, B, C, D, E, F, G, H> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H) => TInstance;

/**
 * Constructor that takes nine arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @template E fifth argument type
 * @template F sixth argument type
 * @template G seventh argument type
 * @template H eighth argument type
 * @template I ninth argument type
 * @returns constructor signature with the given instance and argument types
 */
// prettier-ignore
export type Nonary<TInstance, A, B, C, D, E, F, G, H, I> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I) => TInstance;

/**
 * Constructor that takes ten arguments
 *
 * @template TInstance instance type
 * @template A first argument type
 * @template B second argument type
 * @template C third argument type
 * @template D fourth argument type
 * @template E fifth argument type
 * @template F sixth argument type
 * @template G seventh argument type
 * @template H eighth argument type
 * @template I ninth argument type
 * @template J tenth argument type
 * @returns constructor signature with the given instance and argument types
 */
// prettier-ignore
export type Decenary<TInstance, A, B, C, D, E, F, G, H, I, J> = new (a: A, b: B, c: C, d: D, e: E, f: F, g: G, h: H, i: I, j: J) => TInstance;

/**
 * Constructor that takes any number of arguments of any type
 *
 * @template TInstance instance type
 * @returns constructor signature with the given instance type that accepts any arguments
 */
export type Anyary<TInstance> = new (...args: any[]) => TInstance;

/**
 * Type guard that checks if a value is a constructor function
 *
 * A constructor function is identified by:
 * 1. Being callable (a function)
 * 2. Having a prototype property
 * 3. The prototype's constructor property pointing back to itself
 *
 * @param thing - The value to check
 * @returns `true` if the value is a constructor function, `false` otherwise
 *
 * @example
 * ```typescript
 * class MyClass {}
 * function MyFunction() {}
 * const arrow = () => {};
 *
 * isConstructor(MyClass);     // true
 * isConstructor(MyFunction);  // true (if has prototype.constructor)
 * isConstructor(arrow);       // false
 * isConstructor("string");    // false
 * isConstructor(123);         // false
 * ```
 */
export const isConstructor: {
  <TInstance extends unknown, TArgs extends readonly unknown[]>(
    thing: unknown,
  ): thing is Constructor<TInstance, TArgs>;

  <TConstructor extends Any>(ctor: TConstructor): ctor is TConstructor;
} = (thing: unknown): thing is Constructor<unknown, readonly unknown[]> => {
  if (!Function.isCallable(thing)) return false;

  if (thing.prototype?.constructor === thing) {
    return true;
  }

  return false;
};
