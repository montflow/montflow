import { isArray } from "@montflow/core/array";
import { register, unregister } from "../runtime.js";
import { Snapshot, Source } from "../source/index.js";

export interface Watcher extends Disposable {
  dispose: () => void;
}
export type Options = { immediate?: boolean };

export const DEFAULT_OPTIONS: Required<Options> = { immediate: true };

export function Mono<const V>(
  source: Source<V>,
  callback: (snapshot: Snapshot<V>) => void,
  options?: Options
): Watcher {
  const { immediate } = { ...DEFAULT_OPTIONS, ...options };

  if (immediate) callback({ previous: undefined, value: source() });

  const watcher: Watcher = {
    dispose: () => unregister(source, watcher),
    [Symbol.dispose]: () => watcher.dispose(),
  };

  register(source, watcher, callback);

  return watcher;
}

export const Poly: {
  <A>(
    sources: readonly [Source<A>],
    callback: (values: [Snapshot<A>]) => void,
    options?: Options
  ): Watcher;
  <A, B>(
    sources: readonly [Source<A>, Source<B>],
    callback: (values: [Snapshot<A>, Snapshot<B>]) => void,
    options?: Options
  ): Watcher;
  <A, B, C>(
    sources: readonly [Source<A>, Source<B>, Source<C>],
    callback: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>]) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>],
    callback: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>]) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>, Source<E>],
    callback: (
      values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>, Snapshot<E>]
    ) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E, F>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>, Source<E>, Source<F>],
    callback: (
      values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>, Snapshot<E>, Snapshot<F>]
    ) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E, F, G>(
    sources: readonly [
      Source<A>,
      Source<B>,
      Source<C>,
      Source<D>,
      Source<E>,
      Source<F>,
      Source<G>,
    ],
    callback: (
      values: [
        Snapshot<A>,
        Snapshot<B>,
        Snapshot<C>,
        Snapshot<D>,
        Snapshot<E>,
        Snapshot<F>,
        Snapshot<G>,
      ]
    ) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E, F, G, H>(
    sources: readonly [
      Source<A>,
      Source<B>,
      Source<C>,
      Source<D>,
      Source<E>,
      Source<F>,
      Source<G>,
      Source<H>,
    ],
    callback: (
      values: [
        Snapshot<A>,
        Snapshot<B>,
        Snapshot<C>,
        Snapshot<D>,
        Snapshot<E>,
        Snapshot<F>,
        Snapshot<G>,
        Snapshot<H>,
      ]
    ) => void,
    options?: Options
  ): Watcher;
} = ((
  sources: Source<any>[],
  callback: (snapshots: Snapshot<any>[]) => void,
  options?: Options
): Watcher => {
  const { immediate } = { ...DEFAULT_OPTIONS, ...options };

  const watchers: Watcher[] = [];

  const inputs = sources.map<Snapshot<any>>(source => ({
    previous: undefined,
    value: source(),
  }));

  if (immediate) callback(inputs);

  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    const watcher = Mono(
      source,
      $state => {
        inputs[i] = $state;
        callback(inputs);
      },
      { immediate: false }
    );
    watchers.push(watcher);
  }

  const watcher: Watcher = {
    dispose: () => {
      for (const watcher of watchers) {
        watcher.dispose();
      }
    },
    [Symbol.dispose]: () => watcher.dispose(),
  };

  return watcher;
}) as unknown as typeof Poly;

export const Watcher: {
  <V>(source: Source<V>, callback: (snapshot: Snapshot<V>) => void, options?: Options): Watcher;
  <A>(
    sources: readonly [Source<A>],
    callback: (values: [Snapshot<A>]) => void,
    options?: Options
  ): Watcher;
  <A, B>(
    sources: readonly [Source<A>, Source<B>],
    callback: (values: [Snapshot<A>, Snapshot<B>]) => void,
    options?: Options
  ): Watcher;
  <A, B, C>(
    sources: readonly [Source<A>, Source<B>, Source<C>],
    callback: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>]) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>],
    callback: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>]) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>, Source<E>],
    callback: (
      values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>, Snapshot<E>]
    ) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E, F>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>, Source<E>, Source<F>],
    callback: (
      values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>, Snapshot<E>, Snapshot<F>]
    ) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E, F, G>(
    sources: readonly [
      Source<A>,
      Source<B>,
      Source<C>,
      Source<D>,
      Source<E>,
      Source<F>,
      Source<G>,
    ],
    callback: (
      values: [
        Snapshot<A>,
        Snapshot<B>,
        Snapshot<C>,
        Snapshot<D>,
        Snapshot<E>,
        Snapshot<F>,
        Snapshot<G>,
      ]
    ) => void,
    options?: Options
  ): Watcher;
  <A, B, C, D, E, F, G, H>(
    sources: readonly [
      Source<A>,
      Source<B>,
      Source<C>,
      Source<D>,
      Source<E>,
      Source<F>,
      Source<G>,
      Source<H>,
    ],
    callback: (
      values: [
        Snapshot<A>,
        Snapshot<B>,
        Snapshot<C>,
        Snapshot<D>,
        Snapshot<E>,
        Snapshot<F>,
        Snapshot<G>,
        Snapshot<H>,
      ]
    ) => void,
    options?: Options
  ): Watcher;
} = ((
  sources: Source<any> | [Source<any>, ...Source<any>[]],
  callback: (values: any) => void,
  options?: Options
) => {
  // @ts-ignore
  return isArray(sources) ? Poly(sources, callback, options) : Mono(sources, callback, options);
}) as unknown as typeof Watcher;

export const make = Watcher;
