# function module

Function-shape vocabulary: the aliases and guards this package uses to name
callables. Effect ships its own `Function`; import that directly for `pipe`,
`flow`, and `dual`, and reach here only for the shapes below.

## Belongs here

- Callable aliases — `Callable` (and `Callable.Async`), `Any`, `Operator`,
  `Mapper`, `Nullary`, `Unary`, `Callback`, `Lazy`, `Tapper`, `Maker`,
  `Predicate`, `Guard`
- Runtime guards — `isCallable` / `isFunction`
- `Constructor` alias to the native `Function` constructor, plus `NOOF`/`NOOP`

## Does not belong here

- `new`-able signatures (`Constructor`, `Args`, `Instance`, `isConstructor`) —
  those live in `constructor`
- Async timing helpers (`wait`, `tick`) — those live in `async`
- Effect's `pipe`/`flow`/`dual` — import those from `effect/Function`
