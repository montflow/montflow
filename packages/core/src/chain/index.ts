import * as Function from "../function/index.js";

export const make: {
  <TInput>(input: TInput | Function.Nullary<TInput>): TInput;

  <TInput, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    output: Function.Operator<TInput, TOutput>
  ): TOutput;

  <TInput, A, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    output: Function.Operator<A, TOutput>
  ): TOutput;

  <TInput, A, B, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    output: Function.Operator<B, TOutput>
  ): TOutput;

  <TInput, A, B, C, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    output: Function.Operator<C, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    output: Function.Operator<D, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    output: Function.Operator<E, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, F, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    output: Function.Operator<F, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, F, G, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    g: Function.Operator<F, G>,
    output: Function.Operator<G, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, F, G, H, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    g: Function.Operator<F, G>,
    h: Function.Operator<G, H>,
    output: Function.Operator<H, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, F, G, H, I, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    g: Function.Operator<F, G>,
    h: Function.Operator<G, H>,
    i: Function.Operator<H, I>,
    output: Function.Operator<I, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, F, G, H, I, J, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    g: Function.Operator<F, G>,
    h: Function.Operator<G, H>,
    i: Function.Operator<H, I>,
    j: Function.Operator<I, J>,
    output: Function.Operator<J, TOutput>
  ): TOutput;

  <TInput, A, B, C, D, E, F, G, H, I, J, K, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    g: Function.Operator<F, G>,
    h: Function.Operator<G, H>,
    i: Function.Operator<H, I>,
    j: Function.Operator<I, J>,
    k: Function.Operator<J, K>,
    output: Function.Operator<K, TOutput>
  ): TOutput;
} = (input: any, ...operators: Function.Callable[]): any => {
  let value = Function.isCallable(input) ? input() : input;
  for (let procedure of operators) value = procedure(value);
  return value;
};
