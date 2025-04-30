import { Function } from "@montflow/core";
import * as Source from "../source/index.js";

// #region Types

export interface Watcher extends Disposable {
  drop: () => void;
}

export type Options = {
  immediate?: boolean;
  cleanup?: () => void;
};

export type MonoListener<V> = (value: V) => void;

export type PolyListener<TSources extends Source.Tuple> = (
  values: Source.Values<TSources>
) => void;

// #endregion

// #region Data

export const DEFAULT_OPTIONS = {
  immediate: true,
  cleanup: Function.NOOP,
} as const satisfies Options;

// #endregion

// #region Implementations

export interface mono {
  <V>(source: Source.Source<V>, listener: MonoListener<V>, options?: Options): Watcher;
}

export interface poly {
  <TSources extends Source.Tuple>(
    sources: TSources,
    listener: PolyListener<TSources>,
    options?: Options
  ): Watcher;
}

export interface make extends mono, poly {}

// #endregion
