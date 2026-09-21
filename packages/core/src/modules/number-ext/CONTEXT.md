# number-ext module

Extensions for Effect's `Number` module: the few number helpers Effect does not
ship. Everything else lives in `effect`'s `Number` (plus `Order`/`Predicate`);
consumers import those directly and reach here only for the gaps.

## Belongs here

- `isInt`, `isFloat` — number guards Effect's `Number` lacks
- `isPositive`, `isNegative`, `isNonNegative`, `isNonPositive` — sign predicates
- `isDivisor`, `isMultiple` — divisibility predicates (dual: data-first/data-last)
- `Decrement<N>` — type-level predecessor (1 ≤ N ≤ 1024)

## Does not belong here

- `isNumber` — use `Number.isNumber` from `effect/Number`
- `between` — use `Number.between` from `effect/Number`
- `clamp` — use `Number.clamp` from `effect/Number`
- Range parsing/validation (`Range`/`InvalidRangeError`) — that is the legacy
  `range` module's concern; `Number.between`/`Number.clamp` take
  `{ minimum, maximum }` instead
