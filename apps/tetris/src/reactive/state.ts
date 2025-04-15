import { Array } from "@montflow/core";
import * as Solid from "solid-js";

export type State<V> = { value: V } & Solid.Accessor<V>;
export type Readonly<V> = { readonly value: V } & (() => V);
export type Value<S extends State<unknown>> = S extends State<infer V> ? V : never;
export type Any = State<any>;
export type Tuple = Array.NotEmpty<Any>;
export type Values<T extends Tuple> =
  T extends [State<infer V>, ...infer Rest] ?
    Rest extends Tuple ?
      [V, ...Values<Rest>]
    : [V]
  : never;

export const make: {
  <V>(value: V): State<V>;
  <V>(): State<V | undefined>;
} = <V>(value?: V): State<V> | State<V | undefined> => {
  const [get, set] = Solid.createSignal<V | undefined>(value);

  const self = get as State<V>;

  Object.defineProperty(self, "value", { get, set, enumerable: false, configurable: false });

  return self;
};

export const fromSignal = <V>(signal: Solid.Signal<V>): State<V> => {
  const [get, set] = signal;

  const self = get as State<V>;

  Object.defineProperty(self, "value", { get, set, enumerable: false, configurable: false });

  return self;
};
