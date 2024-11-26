export const state = {
  inContext: false,
  next: 0,
};

export const NOOP = () => {};

export const scoped = <T = void>(fn: () => T): T => {
  state.inContext = true;
  const val = fn();
  state.inContext = false;
  return val;
};
