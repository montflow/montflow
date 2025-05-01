import { Watcher as Base, type Source } from "@montflow/reactive";
import { onDestroy } from "svelte";

export interface Watcher extends Base.Watcher {}

export type Options = Base.Options;

export const DEFAULT_OPTIONS = Base.DEFAULT_OPTIONS;

export type MonoListener<V> = Base.MonoListener<V>;

export type PolyListener<TSources extends Source.Tuple> = Base.PolyListener<TSources>;

export const mono: Base.mono = <V>(
  source: Source.Source<V>,
  listener: MonoListener<V>,
  options?: Options
): Watcher => {
  const { immediate, cleanup } = { ...DEFAULT_OPTIONS, ...options } satisfies Required<Options>;
  let first = true;

  const destroy = $effect.root(() => {
    $effect(() => {
      const value = source();

      if (immediate || !first) listener(value);

      first = false;

      return cleanup;
    });
  });

  onDestroy(destroy);

  return {
    [Symbol.dispose]() {
      destroy();
    },
    drop() {
      this[Symbol.dispose]();
    },
  };
};

export const poly: Base.poly = <T extends Source.Tuple>(
  sources: T,
  listener: PolyListener<T>,
  options?: Options
): Watcher => {
  const { immediate, cleanup } = { ...DEFAULT_OPTIONS, ...options } satisfies Required<Options>;
  let first = true;

  const destroy = $effect.root(() => {
    $effect(() => {
      const values = sources.map(src => src()) as Source.Values<T>;
      if (immediate || !first) listener(values);
      first = false;
      return cleanup;
    });
  });

  onDestroy(destroy);

  return {
    [Symbol.dispose]() {
      destroy();
    },

    drop() {
      this[Symbol.dispose]();
    },
  };
};

export const make: Base.make = (
  source: Source.Source<any> | Source.Tuple<any>,
  listener: MonoListener<any> | PolyListener<any>,
  options?: Options
) => {
  return Array.isArray(source) ?
      // @ts-ignore
      poly(source, listener, options)
    : mono(source, listener, options);
};
