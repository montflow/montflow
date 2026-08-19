import * as Function from '../function/index.js';

export const make: {
  /**
   * Creates a chain with a single input value or nullary function
   *
   * @template TInput The input type
   * @param input The input value or nullary function that provides the input
   * @returns The input value (after calling if it's a function)
   */
  <TInput>(input: TInput | Function.Nullary<TInput>): TInput;

  /**
   * Creates a chain with input and one transformation operator
   *
   * @template TInput The input type
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param output The transformation operator to apply
   * @returns The transformed output value
   */
  <TInput, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    output: Function.Operator<TInput, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and two transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    output: Function.Operator<A, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and three transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    output: Function.Operator<B, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and four transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    output: Function.Operator<C, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and five transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    output: Function.Operator<D, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and six transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    output: Function.Operator<E, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and seven transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, F, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    output: Function.Operator<F, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and eight transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, F, G, TOutput>(
    input: TInput | Function.Nullary<TInput>,
    a: Function.Operator<TInput, A>,
    b: Function.Operator<A, B>,
    c: Function.Operator<B, C>,
    d: Function.Operator<C, D>,
    e: Function.Operator<D, E>,
    f: Function.Operator<E, F>,
    g: Function.Operator<F, G>,
    output: Function.Operator<G, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and nine transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
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
    output: Function.Operator<H, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and ten transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
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
    output: Function.Operator<I, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and eleven transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template J The intermediate type after tenth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param j The tenth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
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
    output: Function.Operator<J, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and twelve transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template J The intermediate type after tenth transformation
   * @template K The intermediate type after eleventh transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param j The tenth transformation operator
   * @param k The eleventh transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
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
    output: Function.Operator<K, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and thirteen transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template J The intermediate type after tenth transformation
   * @template K The intermediate type after eleventh transformation
   * @template L The intermediate type after twelfth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param j The tenth transformation operator
   * @param k The eleventh transformation operator
   * @param l The twelfth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, F, G, H, I, J, K, L, TOutput>(
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
    l: Function.Operator<K, L>,
    output: Function.Operator<L, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and fourteen transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template J The intermediate type after tenth transformation
   * @template K The intermediate type after eleventh transformation
   * @template L The intermediate type after twelfth transformation
   * @template M The intermediate type after thirteenth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param j The tenth transformation operator
   * @param k The eleventh transformation operator
   * @param l The twelfth transformation operator
   * @param m The thirteenth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, F, G, H, I, J, K, L, M, TOutput>(
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
    l: Function.Operator<K, L>,
    m: Function.Operator<L, M>,
    output: Function.Operator<M, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and fifteen transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template J The intermediate type after tenth transformation
   * @template K The intermediate type after eleventh transformation
   * @template L The intermediate type after twelfth transformation
   * @template M The intermediate type after thirteenth transformation
   * @template N The intermediate type after fourteenth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param j The tenth transformation operator
   * @param k The eleventh transformation operator
   * @param l The twelfth transformation operator
   * @param m The thirteenth transformation operator
   * @param n The fourteenth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, F, G, H, I, J, K, L, M, N, TOutput>(
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
    l: Function.Operator<K, L>,
    m: Function.Operator<L, M>,
    n: Function.Operator<M, N>,
    output: Function.Operator<N, TOutput>,
  ): TOutput;

  /**
   * Creates a chain with input and sixteen transformation operators
   *
   * @template TInput The input type
   * @template A The intermediate type after first transformation
   * @template B The intermediate type after second transformation
   * @template C The intermediate type after third transformation
   * @template D The intermediate type after fourth transformation
   * @template E The intermediate type after fifth transformation
   * @template F The intermediate type after sixth transformation
   * @template G The intermediate type after seventh transformation
   * @template H The intermediate type after eighth transformation
   * @template I The intermediate type after ninth transformation
   * @template J The intermediate type after tenth transformation
   * @template K The intermediate type after eleventh transformation
   * @template L The intermediate type after twelfth transformation
   * @template M The intermediate type after thirteenth transformation
   * @template N The intermediate type after fourteenth transformation
   * @template O The intermediate type after fifteenth transformation
   * @template TOutput The final output type
   * @param input The input value or nullary function that provides the input
   * @param a The first transformation operator
   * @param b The second transformation operator
   * @param c The third transformation operator
   * @param d The fourth transformation operator
   * @param e The fifth transformation operator
   * @param f The sixth transformation operator
   * @param g The seventh transformation operator
   * @param h The eighth transformation operator
   * @param i The ninth transformation operator
   * @param j The tenth transformation operator
   * @param k The eleventh transformation operator
   * @param l The twelfth transformation operator
   * @param m The thirteenth transformation operator
   * @param n The fourteenth transformation operator
   * @param o The fifteenth transformation operator
   * @param output The final transformation operator
   * @returns The transformed output value
   */
  <TInput, A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, TOutput>(
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
    l: Function.Operator<K, L>,
    m: Function.Operator<L, M>,
    n: Function.Operator<M, N>,
    o: Function.Operator<N, O>,
    output: Function.Operator<O, TOutput>,
  ): TOutput;
} = (input: any, ...operators: Function.Callable[]): any => {
  let value = Function.isCallable(input) ? input() : input;
  for (const procedure of operators) value = procedure(value);
  return value;
};
