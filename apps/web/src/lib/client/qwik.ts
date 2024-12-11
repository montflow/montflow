import {
  type OnVisibleTaskOptions,
  type QRL,
  type Signal,
  useVisibleTask$,
} from "@builder.io/qwik";

export const useWatch$ = <T>(
  signal: Signal<T>,
  fn: QRL<(value: T) => void>,
  opts?: { immediate?: boolean } & OnVisibleTaskOptions
) => {
  const { immediate } = { immediate: false, ...opts };
  const first = { value: true };

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const value = track(() => signal.value);

    if (!first.value) {
      fn(value);
    } else if (immediate) {
      fn(value);
    }

    first.value = false;
  }, opts);
};
