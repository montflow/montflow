import { Computed as Base, Source } from "@montflow/reactive";

export interface Computed<V> extends Source.Readonly<V> {}

export interface Options extends Base.Options {}

export const DEFAULT_OPTIONS = Base.DEFAULT_OPTIONS;

export type MonoCompute<TInput, TOutput> = Base.MonoCompute<TInput, TOutput>;
export type PolyCompute<TSources extends Source.Tuple, TOutput> = Base.PolyCompute<
  TSources,
  TOutput
>;

export const mono: Base.mono = <const TInput, TOutput>(
  source: Source.Source<TInput>,
  compute: MonoCompute<TInput, TOutput>
): Computed<TOutput> => {
  const value = $derived.by(() => {
    const value = source();
    return compute(value);
  });

  const get: Source.Getter<TOutput> = () => value;

  const computed = get as Computed<TOutput>;

  Object.defineProperties(computed, {
    value: {
      get,
      enumerable: false,
      configurable: false,
    },
  });

  return computed;
};

export const poly: Base.poly = <const T extends Source.Tuple, TOut>(
  sources: T,
  compute: PolyCompute<T, TOut>
): Computed<TOut> => {
  const value = $derived.by(() => {
    const values = sources.map(source => source());

    // @ts-ignore
    return compute(values);
  });

  const get: Source.Getter<TOut> = () => value;

  const computed = get as Computed<TOut>;

  Object.defineProperties(computed, {
    value: {
      get,
      enumerable: false,
      configurable: false,
    },
  });

  return computed;
};

export const make: Base.make = (
  source: Source.Source<any> | Source.Tuple<any>,
  compute: MonoCompute<any, any> | PolyCompute<any, any>,
  options?: Options
) => {
  return Array.isArray(source) ?
      // @ts-ignore
      poly(source, compute, options)
      // @ts-ignore
    : mono(source, compute, options);
};
