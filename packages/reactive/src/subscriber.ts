import { Function } from "@montflow/core";

export interface Subscriber extends Disposable {}

export type Options = {
  signal?: AbortSignal | undefined;
  cleanup?: Function.Callback | undefined;
  immediate?: boolean;
};

export const DEFAULT_OPTIONS = {
  signal: undefined,
  cleanup: undefined,
  immediate: true,
} as const satisfies Options;

export type Callback<T> = (value: T) => void;

export type Subscribable<T> = {
  subscribe: (callback: Callback<T>, options?: Options) => Subscriber;
};
