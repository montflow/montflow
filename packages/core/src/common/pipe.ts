import * as Async from "../async/index.js";
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

/**
 * Takes `input` through a sequence of *possibly* asynchronous transformations.
 *
 * @template Input - The type of the input value.
 * @param {Input | Function.Nullary.Async<Input> | Function.Nullary<Input>} input - The starting value, which can be a value, a promise, or a function that returns a value.
 * @returns {Promise<Input>} - A promise that resolves to the original input value after all transformations (if any).
 */
export async function pipeAsync<Input>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>
): Promise<Input>;

/**
 * Takes `input` through a sequence of *possibly* asynchronous transformations.
 *
 * @template Input - The type of the input value.
 * @template Output - The type of the expected output value.
 * @param {Input | Function.Nullary.Async<Input> | Function.Nullary<Input>} input - The starting value, which can be a value, a promise, or a function that returns a value.
 * @param {Function.Operator<Input, Output> | Function.Operator.Async<Input, Output>} operator - An operator function that transforms the input to the output.
 * @returns {Promise<Output>} - A promise that resolves to the final output value.
 */
export async function pipeAsync<Input, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operator: Function.Operator<Input, Output> | Function.Operator.Async<Input, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operator: Function.Operator<A, Output> | Function.Operator.Async<A, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operator: Function.Operator<B, Output> | Function.Operator.Async<B, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operator: Function.Operator<C, Output> | Function.Operator.Async<C, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operator: Function.Operator<D, Output> | Function.Operator.Async<D, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operator: Function.Operator<E, Output> | Function.Operator.Async<E, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operatorF: Function.Operator<E, F> | Function.Operator.Async<E, F>,
  operator: Function.Operator<F, Output> | Function.Operator.Async<F, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operatorF: Function.Operator<E, F> | Function.Operator.Async<E, F>,
  operatorG: Function.Operator<F, G> | Function.Operator.Async<F, G>,
  operator: Function.Operator<G, Output> | Function.Operator.Async<G, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operatorF: Function.Operator<E, F> | Function.Operator.Async<E, F>,
  operatorG: Function.Operator<F, G> | Function.Operator.Async<F, G>,
  operatorH: Function.Operator<G, H> | Function.Operator.Async<G, H>,
  operator: Function.Operator<H, Output> | Function.Operator.Async<H, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, I, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operatorF: Function.Operator<E, F> | Function.Operator.Async<E, F>,
  operatorG: Function.Operator<F, G> | Function.Operator.Async<F, G>,
  operatorH: Function.Operator<G, H> | Function.Operator.Async<G, H>,
  operatorI: Function.Operator<H, I> | Function.Operator.Async<H, I>,
  operator: Function.Operator<I, Output> | Function.Operator.Async<I, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, I, J, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operatorF: Function.Operator<E, F> | Function.Operator.Async<E, F>,
  operatorG: Function.Operator<F, G> | Function.Operator.Async<F, G>,
  operatorH: Function.Operator<G, H> | Function.Operator.Async<G, H>,
  operatorI: Function.Operator<H, I> | Function.Operator.Async<H, I>,
  operatorJ: Function.Operator<I, J> | Function.Operator.Async<I, J>,
  operator: Function.Operator<J, Output> | Function.Operator.Async<J, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, I, J, K, Output>(
  input: Input | Function.Nullary.Async<Input> | Function.Nullary<Input>,
  operatorA: Function.Operator<Input, A> | Function.Operator.Async<Input, A>,
  operatorB: Function.Operator<A, B> | Function.Operator.Async<A, B>,
  operatorC: Function.Operator<B, C> | Function.Operator.Async<B, C>,
  operatorD: Function.Operator<C, D> | Function.Operator.Async<C, D>,
  operatorE: Function.Operator<D, E> | Function.Operator.Async<D, E>,
  operatorF: Function.Operator<E, F> | Function.Operator.Async<E, F>,
  operatorG: Function.Operator<F, G> | Function.Operator.Async<F, G>,
  operatorH: Function.Operator<G, H> | Function.Operator.Async<G, H>,
  operatorI: Function.Operator<H, I> | Function.Operator.Async<H, I>,
  operatorJ: Function.Operator<I, J> | Function.Operator.Async<I, J>,
  operatorK: Function.Operator<J, K> | Function.Operator.Async<J, K>,
  operator: Function.Operator<K, Output> | Function.Operator.Async<K, Output>
): Promise<Output>;

/**
 * @internal
 */
export async function pipeAsync(input: any, ...operators: Function.Callable[]): Promise<any> {
  let value = Function.isCallable(input)
    ? input()
    : Async.isPromise(input)
      ? await input
      : input;

  for (let procedure of operators) value = await procedure(value);
  return value;
}
