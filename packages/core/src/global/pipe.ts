import * as Function from "../function/index.js";

/**
 * takes `input` through a sequence of transformations
 * @template Input type of input value
 * @param {Input | Function.Nullary<Input>} input starting value
 * @returns {Input} original input
 */
export function pipe<Input>(input: Input | Function.Nullary<Input>): Input;

/**
 * takes `input` through a sequence of transformations
 * @template Input type of input value
 * @template Output type of expected output value
 * @param {Input | Function.Nullary<Input>} input starting value
 * @returns {Output} output. End value
 */
export function pipe<Input, Output>(
  input: Input | Function.Nullary<Input>,
  operator: Function.Operator<Input, Output>
): Output;

export function pipe<Input, A, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operator: Function.Operator<A, Output>
): Output;

export function pipe<Input, A, B, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operator: Function.Operator<B, Output>
): Output;

export function pipe<Input, A, B, C, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operator: Function.Operator<C, Output>
): Output;

export function pipe<Input, A, B, C, D, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operator: Function.Operator<D, Output>
): Output;

export function pipe<Input, A, B, C, D, E, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operator: Function.Operator<E, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operatorF: Function.Operator<E, F>,
  operator: Function.Operator<F, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operatorF: Function.Operator<E, F>,
  operatorG: Function.Operator<F, G>,
  operator: Function.Operator<G, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operatorF: Function.Operator<E, F>,
  operatorG: Function.Operator<F, G>,
  operatorH: Function.Operator<G, H>,
  operator: Function.Operator<H, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, I, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operatorF: Function.Operator<E, F>,
  operatorG: Function.Operator<F, G>,
  operatorH: Function.Operator<G, H>,
  operatorI: Function.Operator<H, I>,
  operator: Function.Operator<I, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, I, J, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operatorF: Function.Operator<E, F>,
  operatorG: Function.Operator<F, G>,
  operatorH: Function.Operator<G, H>,
  operatorI: Function.Operator<H, I>,
  operatorJ: Function.Operator<I, J>,
  operator: Function.Operator<J, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, I, J, K, Output>(
  input: Input | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A>,
  operatorB: Function.Operator<A, B>,
  operatorC: Function.Operator<B, C>,
  operatorD: Function.Operator<C, D>,
  operatorE: Function.Operator<D, E>,
  operatorF: Function.Operator<E, F>,
  operatorG: Function.Operator<F, G>,
  operatorH: Function.Operator<G, H>,
  operatorI: Function.Operator<H, I>,
  operatorJ: Function.Operator<I, J>,
  operatorK: Function.Operator<J, K>,
  operator: Function.Operator<K, Output>
): Output;

/**
 * @internal
 * */
export function pipe(input: any, ...operators: Function.Callable[]): any {
  let value = Function.isCallable(input) ? input() : input;
  for (let procedure of operators) value = procedure(value);
  return value;
}
