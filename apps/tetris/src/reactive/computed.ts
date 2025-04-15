import { createMemo } from "solid-js";
import * as State from "./state";

export type Computed<V> = State.Readonly<V>;

export type Mono<V = any, Output = V> = (value: V) => Output;
export const mono = <V, Output>(
  state: State.State<V>,
  fn: Mono<V, Output>
): Computed<Output> => {
  const get = createMemo(() => fn(state()));

  const self = get as Computed<Output>;
  Object.defineProperty(self, "value", { get, enumerable: false, configurable: false });

  return self;
};

export type Poly<States extends State.Tuple = State.Tuple, Output = any> = (
  values: State.Values<States>
) => Output;
export const poly = <States extends State.Tuple, Output>(
  states: States,
  fn: Poly<States, Output>
): Computed<Output> => {
  const get = createMemo(() => fn(states.map(state => state()) as State.Values<States>));

  const self = get as Computed<Output>;
  Object.defineProperty(self, "value", { get, enumerable: false, configurable: false });

  return self;
};

export const make: typeof mono & typeof poly = (
  state: State.Any | State.Tuple,
  fn: Mono<any, any> | Poly<any, any>
) => {
  return Array.isArray(state)
    ? poly(state, fn as Poly<any, any>)
    : mono(state, fn as Mono<any, any>);
};

export function readonly<V>(state: State.State<V>): State.Readonly<V> {
  return make(state, state => state);
}
