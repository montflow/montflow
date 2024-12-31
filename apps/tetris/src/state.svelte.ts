export type State<V> = {
  value: V;
};

export const State = <V>(initial: V): State<V> => {
  let value = $state(initial);

  return {
    get value() {
      return value;
    },
    set value(v) {
      value = v;
    },
  };
};
