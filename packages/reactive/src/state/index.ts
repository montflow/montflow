import { trigger } from "../runtime";

/** @extends {Source<V>} */
export type State<V> = { value: V } & (() => V);

export function State<V = unknown>(initial: V): State<V> {
  let previous: undefined | V = undefined;
  let value = initial;

  function set(v: V) {
    previous = value;
    value = v;
    trigger(state, { previous, value });
  }

  function get() {
    return value;
  }

  const state = get as State<V>;

  Object.defineProperty(state, "value", { get, set, enumerable: false, configurable: false });

  return state;
}

export const make = State;
