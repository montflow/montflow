import { State as Base, Source } from "@montflow/reactive";

export interface State<V> extends Base.State<V> {}
export interface Readonly<V> extends Base.Readonly<V> {}

export const make: Base.make = <V>(initial?: V): State<V> | State<V | undefined> => {
  let value = $state.raw(initial);

  const get: Source.Getter<V> = () => value!;
  const set: Source.Setter<V> = (v: V) => (value = v);
  const update: Source.Updater<V> = updater => set(updater(get()));

  const state = get as State<V>;

  Object.defineProperties(state, {
    value: {
      get,
      set,
      enumerable: false,
      configurable: false,
    },
    set: {
      value: set,
      enumerable: false,
      writable: false,
      configurable: false,
    },
    update: {
      value: update,
      enumerable: false,
      writable: false,
      configurable: false,
    },
  });

  return state;
};
