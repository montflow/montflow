import { trigger } from "../runtime.js";
import { Snapshot, Source } from "../source/index.js";

import * as Watcher from "../watcher/index.js";

/** @extends {Readonly<Source<V>>} */
export type Computed<V> = { readonly value: V } & (() => V);

/**
 * Options for configuring the behavior of computed values.
 *
 * @template In - The type of the input value.
 * @template Out - The type of the output value. Defaults to the input type.
 *
 * @property {Object} [compute] - Configuration for the computation strategy.
 * @property {"always" | "once" | "never" | "loose" | "strict"} [compute.strategy] - The strategy for computing the value:
 * - "always": Always compute the value whenever the state changes, even if the value is the same.
 * - "once": Compute the value only once, and then never again.
 * - "never": Compute the value initially, but never recompute it even if the state changes.
 * - "loose": Compute the value only if the state changes loosely (i.e., the new value is different from the previous value).
 * - "strict": Compute the value only if the state changes strictly (i.e., the new value is strictly different from the previous value).
 * @property {number} [compute.times] - The number of times to compute the value when using the "limit" strategy.
 * @property {(previous: In, next: In) => boolean} [compute.filter] - A filter function to determine whether to compute the value when using the "conditional" strategy.
 *
 * @property {Object} [trigger] - Configuration for the trigger strategy.
 * @property {"loose" | "strict"} [trigger.strategy] - The strategy for triggering the computation:
 * - "loose": Trigger the computation if the output value changes loosely.
 * - "strict": Trigger the computation if the output value changes strictly.
 * @property {(current: Out, next: Out) => boolean} [trigger.filter] - A filter function to determine whether to trigger the computation when using the "conditional" strategy.
 */
export type Options<In, Out = In> = {
  compute?:
    | { strategy?: "always" | "once" | "never" | "loose" | "strict" }
    | { strategy?: "limit"; times: number }
    | { strategy?: "conditional"; filter: (previous: In, next: In) => boolean };

  trigger?:
    | { strategy?: "loose" | "strict" }
    | { strategy?: "conditional"; filter: (current: Out, next: Out) => boolean };
};

export const DEFAULT_OPTIONS: Required<Options<any>> = {
  compute: { strategy: "strict" },
  trigger: { strategy: "strict" },
};

export function Mono<const In, Out = In>(
  source: Source<In>,
  compute: (snapshot: Snapshot<In>) => Out,
  options?: Options<In, Out>
): Computed<Out> {
  const opts: Required<Options<In, Out>> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let previous: undefined | Out = undefined;
  let value: Out = compute({ previous: previous, value: source() });

  let incomingPrevious: In = source();

  let times = 0;

  const get = () => value;

  const self = get as Computed<Out>;

  Object.defineProperty(self, "value", { get, enumerable: false, configurable: false });

  Watcher.make(
    source,
    snapshot => {
      let shouldCompute = false;

      switch (opts.compute.strategy) {
        case "always": {
          shouldCompute = true;
          break;
        }

        case "once": {
          shouldCompute = times === 0;
          break;
        }

        case "never": {
          shouldCompute = false;
          break;
        }

        case "loose": {
          shouldCompute = snapshot.value != incomingPrevious;
          break;
        }

        case "strict": {
          shouldCompute = snapshot.value !== incomingPrevious;
          break;
        }

        case "conditional": {
          shouldCompute = opts.compute.filter(incomingPrevious, snapshot.value);
          break;
        }

        case "limit": {
          shouldCompute = times < opts.compute.times;
          break;
        }
      }

      if (!shouldCompute) return;

      const computedValue = compute({ previous: incomingPrevious, value: snapshot.value });

      let shouldTrigger = false;

      switch (opts.trigger.strategy) {
        case "loose": {
          shouldTrigger = value != computedValue;
          break;
        }

        case "strict": {
          shouldTrigger = value !== computedValue;
          break;
        }

        case "conditional": {
          shouldTrigger = opts.trigger.filter(value, computedValue);
          break;
        }
      }

      if (!shouldTrigger) return;

      times++;

      incomingPrevious = snapshot.value;
      previous = value;
      value = computedValue;

      trigger(self, { previous, value });
    },
    { immediate: false }
  );

  return self;
}

export const Poly: {
  <A, Out>(
    sources: readonly [Source<A>],
    compute: (values: [Snapshot<A>]) => Out,
    options?: Options<[A], Out>
  ): Computed<Out>;
  <A, B, Out>(
    sources: readonly [Source<A>, Source<B>],
    compute: (values: [Snapshot<A>, Snapshot<B>]) => Out,
    options?: Options<[A, B], Out>
  ): Computed<Out>;
  <A, B, C, Out>(
    sources: readonly [Source<A>, Source<B>, Source<C>],
    compute: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>]) => Out,
    options?: Options<[A, B, C], Out>
  ): Computed<Out>;
  <A, B, C, D, Out>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>],
    compute: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>]) => Out,
    options?: Options<[A, B, C, D], Out>
  ): Computed<Out>;
  <A, B, C, D, E, Out>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>, Source<E>],
    compute: (values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>, Snapshot<E>]) => Out,
    options?: Options<[A, B, C, D, E], Out>
  ): Computed<Out>;
  <A, B, C, D, E, F, Out>(
    sources: readonly [Source<A>, Source<B>, Source<C>, Source<D>, Source<E>, Source<F>],
    compute: (
      values: [Snapshot<A>, Snapshot<B>, Snapshot<C>, Snapshot<D>, Snapshot<E>, Snapshot<F>]
    ) => Out,
    options?: Options<[A, B, C, D, E, F], Out>
  ): Computed<Out>;
  <A, B, C, D, E, F, G, Out>(
    sources: readonly [
      Source<A>,
      Source<B>,
      Source<C>,
      Source<D>,
      Source<E>,
      Source<F>,
      Source<G>,
    ],
    compute: (
      values: [
        Snapshot<A>,
        Snapshot<B>,
        Snapshot<C>,
        Snapshot<D>,
        Snapshot<E>,
        Snapshot<F>,
        Snapshot<G>,
      ]
    ) => Out,
    options?: Options<[A, B, C, D, E, F, G], Out>
  ): Computed<Out>;
  <A, B, C, D, E, F, G, H, Out>(
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
    compute: (
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
    ) => Out,
    options?: Options<[A, B, C, D, E, F, G, H], Out>
  ): Computed<Out>;
} = (<Out>(
  sources: readonly Source<any>[],
  compute: (snapshots: Snapshot<any>[]) => any,
  options?: Options<any, any>
): Computed<Out> => {
  const opts: Required<Options<any, any>> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  let previous: undefined | any = undefined;
  let value: any = compute(sources.map(source => ({ previous: undefined, value: source() })));

  let incomingPrevious: any[] = sources.map(source => source());

  let times = 0;

  const get = () => value;

  const self = get as Computed<any>;

  Object.defineProperty(self, "value", { get, enumerable: false, configurable: false });

  Watcher.make(
    // @ts-ignore
    sources,
    (snapshots: Snapshot<any>[]) => {
      let shouldCompute = false;

      switch (opts.compute.strategy) {
        case "always": {
          shouldCompute = true;
          break;
        }

        case "once": {
          shouldCompute = times === 0;
          break;
        }

        case "never": {
          shouldCompute = false;
          break;
        }

        case "loose": {
          shouldCompute = snapshots.some(
            (snapshot, i) => snapshot.value != incomingPrevious[i]
          );
          break;
        }

        case "strict": {
          shouldCompute = snapshots.some(
            (snapshot, i) => snapshot.value !== incomingPrevious[i]
          );
          break;
        }

        case "conditional": {
          shouldCompute = opts.compute.filter(
            incomingPrevious,
            snapshots.map(snapshot => snapshot.value)
          );
          break;
        }

        case "limit": {
          shouldCompute = times < opts.compute.times;
          break;
        }
      }

      if (!shouldCompute) return;

      const computedValue = compute(snapshots);

      let shouldTrigger = false;

      switch (opts.trigger.strategy) {
        case "loose": {
          shouldTrigger = value != computedValue;
          break;
        }

        case "strict": {
          shouldTrigger = value !== computedValue;
          break;
        }

        case "conditional": {
          shouldTrigger = opts.trigger.filter(value, computedValue);
          break;
        }
      }

      if (!shouldTrigger) return;

      times++;

      incomingPrevious = snapshots.map(snapshot => snapshot.value);
      previous = value;
      value = computedValue;

      trigger(self, { previous, value });
    },
    { immediate: false }
  );

  return self;
}) as unknown as typeof Poly;
