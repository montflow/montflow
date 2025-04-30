import * as Source from "../source/index.js";

// #region Types

export interface Computed<V> extends Source.Readonly<V> {}

export type Options = {};

export type MonoCompute<TInput, TOutput> = (value: TInput) => TOutput;

export type PolyCompute<TSources extends Source.Tuple, TOutput> = (
  value: Source.Values<TSources>
) => TOutput;

// #endregion

// #region Data

export const DEFAULT_OPTIONS = {} satisfies Options;

// #endregion

// #region Implementations

export interface mono {
  <const TInput, TOutput>(
    source: Source.Source<TInput>,
    compute: MonoCompute<TInput, TOutput>,
    options?: Options
  ): Computed<TOutput>;
}

export interface poly {
  <const TSources extends Source.Tuple, TOutput>(
    sources: TSources,
    compute: PolyCompute<TSources, TOutput>
  ): Computed<TOutput>;
}

export interface make extends mono, poly {}

// #endregion
