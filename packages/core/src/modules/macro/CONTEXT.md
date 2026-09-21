# macro module

Meta-programming and escape-hatch helpers: throwaway IIFEs, unchecked casts,
singleton/once caching, dual-style function construction, and the panic/todo
family. These are the primitives other modules build on.

## Belongs here

- `lambda`, `cast`, `evaluate`, `assert`, `dualify` (+ `Dualify.Options`)
- `singleton`, `once` and their `*AlreadyExistsError` classes
- `panic`, `todo`, `todoImpl`, `placeholder`
- Sentinel values `never`, `unknown`, `undefined`, `void`, `null`

## Does not belong here

- Domain or numeric/table/text logic — those get their own module
- Function-shape aliases (`Callable`, `Maker`, `Predicate`) — those live in
  `function`
- Constructor type utilities — those live in `constructor`
