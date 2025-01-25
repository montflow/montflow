import * as Array from "@/array";
import * as Iterable from "@/iterable";
import * as Macro from "@/macro";
import * as Maybe from "@/maybe";
import * as Number from "@/number";

/** Function that generates number between 0 (inclusive) and 1 (exclusive) */
export type Generator = () => number;

export const uniform: Generator = Math.random;

export namespace nextInt {
  export type Options = { generator?: Generator; range?: Number.Range };
}
export const nextInt = (options?: nextInt.Options): number => {
  const { generator, range } = {
    generator: uniform,
    range: [0, 1],
    ...options,
  } satisfies Required<nextInt.Options>;

  const { min, max } = Number.resolveRange(range);

  if (min === max) {
    return min;
  }

  if (min > max) {
    throw new Error("Invalid range: min must be less than max");
  }

  const value = generator();
  return Math.floor(value * (max - min + (1 - Number.Constructor.EPSILON)) + min);
};

export namespace nextFloat {
  export type Options = { generator?: Generator; range?: Number.Range };
}

export const nextFloat = (options?: nextFloat.Options): number => {
  const { generator, range } = {
    generator: uniform,
    range: [0, 1],
    ...options,
  } satisfies Required<nextFloat.Options>;

  const { min, max } = Number.resolveRange(range);

  if (min >= max) {
    throw new Error("Invalid range: min must be less than max");
  }

  const randomValue = generator();
  if (randomValue === 1) return max;
  return min + randomValue * (max - min);
};

export namespace NextPick {
  export type Options = { generator?: Generator };
}

// function _nextPick<T>(self: Iterable<T>, options?: nextPick.Options): Maybe.Maybe<T> {
//   const items = Array.isArray(self) ? (self as Array<T>) : Array.Constructor.from<T>(self);

//   if (Array.isEmpty(items)) return Maybe.None();

//   const { generator } = { generator: uniform, ...options } satisfies Required<nextPick.Options>;

//   const index = nextInt({ generator, range: [0, items.length - 1] });
//   return Maybe.Some(items[index]);
// }

// export const nextPick: {
//   <T>(options?: nextPick.Options): (self: Iterable<T>) => Maybe.Maybe<T>;
//   <T>(self: Iterable<T>, options?: nextPick.Options): Maybe.Maybe<T>;
// } = (<T>(optionsOrSelf?: nextPick.Options | Iterable<T>, options?: nextPick.Options) => {
//   if (optionsOrSelf === undefined || !Iterable.isIterable(optionsOrSelf))
//     return (self: Iterable<T>) => _nextPick(self, optionsOrSelf);
//   return _nextPick(optionsOrSelf, options);
// }) as typeof nextPick;

export const nextPick: {
  <T>(self: Iterable<T>, options?: NextPick.Options): Maybe.Maybe<T>;
  <T>(options?: NextPick.Options): (self: Iterable<T>) => Maybe.Maybe<T>;
} = Macro.dualify(
  0,
  <T>(self: Iterable<T>, options?: NextPick.Options): Maybe.Maybe<T> => {
    const items = Array.isArray(self) ? (self as Array<T>) : Array.Constructor.from<T>(self);

    if (Array.isEmpty(items)) return Maybe.None();

    const { generator } = {
      generator: uniform,
      ...options,
    } satisfies Required<NextPick.Options>;

    const index = nextInt({ generator, range: [0, items.length - 1] });
    return Maybe.Some(items[index]);
  },
  { withTail: true, isSelf: Iterable.isIterable }
);
