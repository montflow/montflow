export type Signal<V> = {
  value: V;
} & (() => V);

export function signal<V>(initial: V): Signal<V> {
  let value = $state(initial);

  const get = () => value;
  const set = (v: V) => (value = v);

  const self = get as Signal<V>;

  Object.defineProperty(self, "value", { get, set, enumerable: false, configurable: false });

  return self;
}

export type Computed<V> = {
  readonly value: V;
} & (() => V);

export function computed<V>(fn: () => V): Computed<V> {
  const value = $derived(fn());

  const get = () => value;

  const self = get as Computed<V>;

  Object.defineProperty(self, "value", { get, enumerable: false, configurable: false });

  return self;
}
