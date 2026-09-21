# string-ext module

Extensions for Effect's `String` module: the few string helpers Effect does not
ship. Everything else lives in `effect`'s `String` (or `Predicate`); consumers
import those directly and reach here only for the gaps.

## Belongs here

- `hasSpaces` — checks whether a string contains a space
- `hasNoSpaces` — inverse of `hasSpaces`
- `IsEmpty` / `IsNotEmpty` — type-level emptiness checks on a string type
- `HasSpaces` — type-level space check on a string type

## Does not belong here

- Anything Effect's `String` already provides (`isString`, `capitalize`,
  `isEmpty`, `isNonEmpty`, `length`, `toUpperCase`, `toLowerCase`,
  `includes`, `trim`, `split`, `replace`, ...) — import those from
  `effect/String`
- Runtime string validation — `Predicate.isString` / `String.isString` cover it
- `capitalize` from legacy `text` — Effect's `String.capitalize` supersedes it
  (single leading character, not per-word title casing); do not re-export the
  legacy variant
- New string helpers with no verified gap — this module stays nearly empty by
  design
