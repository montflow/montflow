import { Function } from "@montflow/core";
import * as Source from "./source.js";

export interface Watcher extends Disposable {}

export type Options<TVerbose extends boolean = false> = {
  immediate?: boolean;
  cleanup?: () => void;
  vebose?: TVerbose;
};

export const DEFAULT_OPTIONS = {
  immediate: true,
  cleanup: Function.NOOP,
  vebose: false,
} as const satisfies Options;

export namespace Mono {
  export type Listener<V, TVerbose extends boolean> =
    TVerbose extends false ? (value: V) => void : (snapshot: Source.Snapshot<V>) => void;
}

export namespace Poly {
  export type Listener<T extends Source.Tuple, TVerbose extends boolean> =
    TVerbose extends false ? (values: Source.Values<T>) => void
    : (snapshots: Source.ValueSnapshots<T>) => void;
}

export namespace Module {
  export interface mono {
    <const V, const TVerbose extends boolean = false>(
      source: Source.Source<V>,
      listener: Mono.Listener<V, TVerbose>,
      options?: Options<TVerbose>
    ): Watcher;
  }

  export interface poly {
    <const T extends Source.Tuple, TVerbose extends boolean = false>(
      sources: T,
      listener: Poly.Listener<T, TVerbose>,
      options?: Options<TVerbose>
    ): Watcher;
  }

  export type make = mono & poly;
}
