# array-ext module

Extensions for Effect's `Array` module: the few array helpers Effect does not
ship. Everything else lives in `effect`'s `Array`; consumers import that
directly and reach here only for the gaps.

## Belongs here

- `isArrayOf` — `Array.isArray` plus an element refinement (not in Effect)
- `lastIndex`, `maybeLastIndex`, `isLastIndex` — last-position helpers
- `isLast` — element-equality check against the last element

## Does not belong here

- Anything Effect's `Array` already provides (`get`, `head`, `last`,
  `isArray`, `isArrayEmpty`, `isArrayNonEmpty`, `replicate`, `length`, `empty`,
  `fromIterable`) — import those from `effect/Array` instead
- Array-like source transforms (`from`, `filled`) — `Array.fromIterable` /
  `Array.replicate` cover these
- `first` / `last` raw-value accessors — Effect returns `Option`; use
  `Array.head` / `Array.last`
