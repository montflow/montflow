# record-ext module

Extensions for Effect's `Record` module: the few record helpers Effect does
not ship. Everything else lives in `effect`'s `Record` (or `Predicate`);
consumers import those directly and reach here only for the gaps.

## Belongs here

- `pick` / `omit` — dual, data-first/data-last key selection (`Record` has no
  such helper; `effect/Struct` has struct-typed variants but these are
  `object`-shaped)
- `hasKeys` — all-keys-present-with-non-undefined-value refinement
- `keyefy` — deterministic string key derived from a nested struct
- `flatten` / `Flatten` — dot-notation flattening of nested objects and arrays
- `Optional`, `Value`, `Keys`, `IsEmpty`, `Values`, `Entries` — type-level
  companions to the runtime `Record` API

## Does not belong here

- Anything Effect's `Record` already provides (`has`, `get`, `keys`, `values`,
  `toEntries`, `fromEntries`, `size`, `map`, `filter`, `remove`, `union`,
  `intersection`, `difference`, `isEmptyRecord`, ...) — import those from
  `effect/Record` instead
- Single-key presence checks — `Record.has` (own key) or `Predicate.hasProperty`
  (refinement on unknown) cover `hasKey`
- `isObject` / `isTable` — `Predicate.isObject` and `Predicate.isObjectOrArray`
  cover both runtime guards
- Runtime `values`, `keys`, `size` / `length`, `entries` — `Record.values`,
  `Record.keys`, `Record.size`, `Record.toEntries` supersede them
