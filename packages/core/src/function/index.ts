/**
 * A generic function signature
 */
export type Callable = (...args: any[]) => any;

/**
 * Function that operates over `Input` to produce `Output`
 * @template Input input type
 * @template Output expected output type
 */
export type Operator<Input, Output = Input> = (input: Input) => Output;

export namespace Operator {
  export type Async<Input, Output = Input> = (input: Input) => Promise<Output>;
}

/**
 * Function that takes single `From` value and maps it onto `To` value
 * @template From input type
 * @template To output type
 */
export type Mapper<From, To> = (value: From) => To;

/**
 * Function that takes no arguments and returns `Output`
 * @template Output the output type
 */
export type Nullary<Output> = () => Output;

export namespace Nullary {
  export type Any = Nullary<any>;
  export type Async<Output> = Nullary<Promise<Output>>;
}

/**
 * Function that takes a single argument of type `A` and produces `Output`
 * @template A input type
 * @template Output the output type
 */
export type Unary<A, Output> = (a: A) => Output;

export namespace Unary {
  export type Async<A, Output> = Unary<A, Promise<Output>>;
}

/**
 * Function that takes no arguments and always returns `void` (nothing)
 */
export type Callback = () => void;

/**
 * Function that takes input and returns a boolean based on an arbitrary condition
 * @template Input the input argument value type
 */
export type Predicate<Input> = (input: Input) => boolean;

/**
 * Function to narrow input type based on a runtime check
 * @template Value the expected output type of `input` given the boolean result
 */
export type Guard<Value> = (input: unknown) => input is Value;

/**
 * Type guard for to check if a value is a `Callable`.
 *
 * @param input The value to check.
 * @returns {boolean} `true` if the value is a function.
 */
export const isCallable: Guard<Callable> = (input): input is Callable =>
  typeof input === "function";

/**
 * @alias {@link isCallable}
 */
export const isFunction = isCallable;

/**
 * **N**o **O**peration **F**unction. Function that does nothing.
 */
export const NOOF = () => {};

/**
 * **N**o **O**peration **P**rocedure. Function that does nothing.
 * @alias {@link NOOF}
 */
export const NOOP = NOOF;

/**
 * @copyright [`effect/Funtion.ts`](https://github.com/Effect-TS/effect/blob/main/packages/effect/src/Function.ts)
 *
 * Creates a function that can be used in a data-last (aka `pipe`able) or data-first style.
 *
 * @param arity - Either the arity of the uncurried function or a predicate
 *                which determines if the function is being used in a data-first
 *                or data-last style.
 * @param body - The definition of the uncurried function.
 */
export const dualify: {
  <
    DataLast extends (...args: Array<any>) => any,
    DataFirst extends (...args: Array<any>) => any,
  >(
    arity: Parameters<DataFirst>["length"],
    body: DataFirst
  ): DataLast & DataFirst;
  <
    DataLast extends (...args: Array<any>) => any,
    DataFirst extends (...args: Array<any>) => any,
  >(
    isDataFirst: (args: IArguments) => boolean,
    body: DataFirst
  ): DataLast & DataFirst;
} = function (arity, body) {
  if (typeof arity === "function") {
    return function () {
      if (arity(arguments)) {
        // @ts-expect-error
        return body.apply(this, arguments);
      }
      return ((self: any) => body(self, ...arguments)) as any;
    };
  }

  switch (arity) {
    case 0:
      throw new RangeError(`Invalid arity ${arity}`);
    case 1:
      return dualify(args => args.length === 1, body);

    case 2:
      return function (a, b) {
        if (arguments.length >= 2) {
          return body(a, b);
        }
        return function (self: any) {
          return body(self, a);
        };
      };

    case 3:
      return function (a, b, c) {
        if (arguments.length >= 3) {
          return body(a, b, c);
        }
        return function (self: any) {
          return body(self, a, b);
        };
      };

    case 4:
      return function (a, b, c, d) {
        if (arguments.length >= 4) {
          return body(a, b, c, d);
        }
        return function (self: any) {
          return body(self, a, b, c);
        };
      };

    case 5:
      return function (a, b, c, d, e) {
        if (arguments.length >= 5) {
          return body(a, b, c, d, e);
        }
        return function (self: any) {
          return body(self, a, b, c, d);
        };
      };

    default:
      return function () {
        if (arguments.length >= arity) {
          // @ts-expect-error
          return body.apply(this, arguments);
        }
        const args = arguments;
        return function (self: any) {
          return body(self, ...args);
        };
      };
  }
};
