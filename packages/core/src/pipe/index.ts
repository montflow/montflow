import { isPromise } from "../async";
import { Callable, Nullary, Operator, isCallable } from "../function";

/**
 * takes `input` through a sequence of transformations
 * @template Input type of input value
 * @param {Input | Nullary<Input>} input starting value
 * @returns {Input} original input
 */
export function pipe<Input>(input: Input | Nullary<Input>): Input;

/**
 * takes `input` through a sequence of transformations
 * @template Input type of input value
 * @template Output type of expected output value
 * @param {Input | Nullary<Input>} input starting value
 * @returns {Output} output. End value
 */
export function pipe<Input, Output>(
  input: Input | Nullary<Input>,
  operator: Operator<Input, Output>
): Output;

export function pipe<Input, A, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operator: Operator<A, Output>
): Output;

export function pipe<Input, A, B, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operator: Operator<B, Output>
): Output;

export function pipe<Input, A, B, C, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operator: Operator<C, Output>
): Output;

export function pipe<Input, A, B, C, D, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operator: Operator<D, Output>
): Output;

export function pipe<Input, A, B, C, D, E, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operator: Operator<E, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operatorF: Operator<E, F>,
  operator: Operator<F, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operatorF: Operator<E, F>,
  operatorG: Operator<F, G>,
  operator: Operator<G, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operatorF: Operator<E, F>,
  operatorG: Operator<F, G>,
  operatorH: Operator<G, H>,
  operator: Operator<H, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, I, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operatorF: Operator<E, F>,
  operatorG: Operator<F, G>,
  operatorH: Operator<G, H>,
  operatorI: Operator<H, I>,
  operator: Operator<I, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, I, J, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operatorF: Operator<E, F>,
  operatorG: Operator<F, G>,
  operatorH: Operator<G, H>,
  operatorI: Operator<H, I>,
  operatorJ: Operator<I, J>,
  operator: Operator<J, Output>
): Output;

export function pipe<Input, A, B, C, D, E, F, G, H, I, J, K, Output>(
  input: Input | Nullary<Input>,
  operatorA: Operator<Input, A>,
  operatorB: Operator<A, B>,
  operatorC: Operator<B, C>,
  operatorD: Operator<C, D>,
  operatorE: Operator<D, E>,
  operatorF: Operator<E, F>,
  operatorG: Operator<F, G>,
  operatorH: Operator<G, H>,
  operatorI: Operator<H, I>,
  operatorJ: Operator<I, J>,
  operatorK: Operator<J, K>,
  operator: Operator<K, Output>
): Output;

/**
 * @internal
 * */
export function pipe(input: any, ...operators: Callable[]): any {
  let value = isCallable(input) ? input() : input;
  for (let procedure of operators) value = procedure(value);
  return value;
}

/**
 * Takes `input` through a sequence of *possibly* asynchronous transformations.
 *
 * @template Input - The type of the input value.
 * @param {Input | Nullary.Async<Input> | Nullary<Input>} input - The starting value, which can be a value, a promise, or a function that returns a value.
 * @returns {Promise<Input>} - A promise that resolves to the original input value after all transformations (if any).
 */
export async function pipeAsync<Input>(
  input: Input | Nullary.Async<Input> | Nullary<Input>
): Promise<Input>;

/**
 * Takes `input` through a sequence of *possibly* asynchronous transformations.
 *
 * @template Input - The type of the input value.
 * @template Output - The type of the expected output value.
 * @param {Input | Nullary.Async<Input> | Nullary<Input>} input - The starting value, which can be a value, a promise, or a function that returns a value.
 * @param {Operator<Input, Output> | Operator.Async<Input, Output>} operator - An operator function that transforms the input to the output.
 * @returns {Promise<Output>} - A promise that resolves to the final output value.
 */
export async function pipeAsync<Input, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operator: Operator<Input, Output> | Operator.Async<Input, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operator: Operator<A, Output> | Operator.Async<A, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operator: Operator<B, Output> | Operator.Async<B, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operator: Operator<C, Output> | Operator.Async<C, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operator: Operator<D, Output> | Operator.Async<D, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operator: Operator<E, Output> | Operator.Async<E, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operatorF: Operator<E, F> | Operator.Async<E, F>,
  operator: Operator<F, Output> | Operator.Async<F, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operatorF: Operator<E, F> | Operator.Async<E, F>,
  operatorG: Operator<F, G> | Operator.Async<F, G>,
  operator: Operator<G, Output> | Operator.Async<G, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operatorF: Operator<E, F> | Operator.Async<E, F>,
  operatorG: Operator<F, G> | Operator.Async<F, G>,
  operatorH: Operator<G, H> | Operator.Async<G, H>,
  operator: Operator<H, Output> | Operator.Async<H, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, I, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operatorF: Operator<E, F> | Operator.Async<E, F>,
  operatorG: Operator<F, G> | Operator.Async<F, G>,
  operatorH: Operator<G, H> | Operator.Async<G, H>,
  operatorI: Operator<H, I> | Operator.Async<H, I>,
  operator: Operator<I, Output> | Operator.Async<I, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, I, J, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operatorF: Operator<E, F> | Operator.Async<E, F>,
  operatorG: Operator<F, G> | Operator.Async<F, G>,
  operatorH: Operator<G, H> | Operator.Async<G, H>,
  operatorI: Operator<H, I> | Operator.Async<H, I>,
  operatorJ: Operator<I, J> | Operator.Async<I, J>,
  operator: Operator<J, Output> | Operator.Async<J, Output>
): Promise<Output>;

export async function pipeAsync<Input, A, B, C, D, E, F, G, H, I, J, K, Output>(
  input: Input | Nullary.Async<Input> | Nullary<Input>,
  operatorA: Operator<Input, A> | Operator.Async<Input, A>,
  operatorB: Operator<A, B> | Operator.Async<A, B>,
  operatorC: Operator<B, C> | Operator.Async<B, C>,
  operatorD: Operator<C, D> | Operator.Async<C, D>,
  operatorE: Operator<D, E> | Operator.Async<D, E>,
  operatorF: Operator<E, F> | Operator.Async<E, F>,
  operatorG: Operator<F, G> | Operator.Async<F, G>,
  operatorH: Operator<G, H> | Operator.Async<G, H>,
  operatorI: Operator<H, I> | Operator.Async<H, I>,
  operatorJ: Operator<I, J> | Operator.Async<I, J>,
  operatorK: Operator<J, K> | Operator.Async<J, K>,
  operator: Operator<K, Output> | Operator.Async<K, Output>
): Promise<Output>;

/**
 * @internal
 */
export async function pipeAsync(input: any, ...operators: Callable[]): Promise<any> {
  let value = isCallable(input) ? input() : isPromise(input) ? await input : input;

  for (let procedure of operators) value = await procedure(value);
  return value;
}
