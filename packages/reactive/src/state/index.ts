import * as Source from "../source/index.js";

// #region Types

export interface State<V> extends Source.Writable<V> {}
export interface Readonly<V> extends Source.Readonly<V> {}

// #endregion

// #region Implementations

export interface make {
  <V = unknown>(initial: V): State<V>;
  <V = unknown>(): State<V | undefined>;
}

// #endregion
