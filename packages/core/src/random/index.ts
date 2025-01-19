import { isArray, isEmpty } from "../array";
import { isIterable } from "../iterable";
import { Maybe, None, Some } from "../maybe";
import { Range, resolveRange } from "../number";

/** Function that generates number between 0 (inclusive) and 1 (exclusive) */
export type Generator = () => number;

export const uniform: Generator = Math.random;

export namespace nextInt {
  export type Options = { generator?: Generator; range?: Range };
}
export const nextInt = (options?: nextInt.Options): number => {
  const { generator, range } = {
    generator: uniform,
    range: [0, 1],
    ...options,
  } satisfies Required<nextInt.Options>;

  const { min, max } = resolveRange(range);

  if (min === max) {
    return min;
  }

  if (min > max) {
    throw new Error("Invalid range: min must be less than max");
  }

  const value = generator();
  return Math.floor(value * (max - min + (1 - Number.EPSILON)) + min);
};

export namespace nextFloat {
  export type Options = { generator?: Generator; range?: Range };
}

export const nextFloat = (options?: nextFloat.Options): number => {
  const { generator, range } = {
    generator: uniform,
    range: [0, 1],
    ...options,
  } satisfies Required<nextFloat.Options>;

  const { min, max } = resolveRange(range);

  if (min >= max) {
    throw new Error("Invalid range: min must be less than max");
  }

  const randomValue = generator();
  if (randomValue === 1) return max;
  return min + randomValue * (max - min);
};

export namespace nextPick {
  export type Options = { generator?: Generator };
}

function _nextPick<T>(self: Iterable<T>, options?: nextPick.Options): Maybe<T> {
  const items = isArray(self) ? (self as Array<T>) : Array.from<T>(self);

  if (isEmpty(items)) return None();

  const { generator } = { generator: uniform, ...options } satisfies Required<nextPick.Options>;

  const index = nextInt({ generator, range: [0, items.length - 1] });
  return Some(items[index]);
}

export const nextPick: {
  <T>(options?: nextPick.Options): (self: Iterable<T>) => Maybe<T>;
  <T>(self: Iterable<T>, options?: nextPick.Options): Maybe<T>;
} = (<T>(optionsOrSelf?: nextPick.Options | Iterable<T>, options?: nextPick.Options) => {
  if (optionsOrSelf === undefined || !isIterable(optionsOrSelf))
    return (self: Iterable<T>) => _nextPick(self, optionsOrSelf);
  return _nextPick(optionsOrSelf, options);
}) as typeof nextPick;
