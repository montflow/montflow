import { createEffect } from "solid-js";
import * as State from "./state";

export type Options = { immediate?: boolean };

export type Mono<V = any> = (value: V) => void;
export const mono = <V>(state: State.State<V>, fn: Mono<V>, options?: Options): void => {
  const { immediate = true } = options ?? {};

  let first = true;

  createEffect(() => {
    const value = state();

    if (first && !immediate) {
      first = false;
      return;
    }

    fn(value);
  });
};

export type Poly<States extends State.Tuple = State.Tuple> = (
  values: State.Values<States>
) => void;
export const poly = <States extends State.Tuple>(
  states: States,
  fn: Poly<States>,
  options?: Options
): void => {
  const { immediate = true } = options ?? {};

  let first = true;

  createEffect(() => {
    const values = states.map(state => state()) as State.Values<States>;

    if (first && !immediate) {
      first = false;
      return;
    }

    fn(values);
  });
};

export const make: typeof mono & typeof poly = (
  state: State.Any | State.Tuple,
  fn: Mono | Poly,
  options?: Options
) => {
  return Array.isArray(state) ? poly(state, fn, options) : mono(state, fn, options);
};
