# global module

Smalls support aliases that have no natural single module to live in and are
re-exported flat through the package root (not namespaced). Everything here is
a type alias; the module deliberately has no runtime surface.

## Belongs here

- Primitive aliases — `Missing`, `Yes`, `No`, `Never`
- `Lazy` / `Sync` — nullary value producers
- `Optional` / `Evaluable` — value-or-undefined and value-or-thunk
- Object vocabulary — `PropertyKey`, `Dictionary`, `Struct`, `Simplify`

## Does not belong here

- Any behavior or runtime value — aliases only
- Function-shape aliases (`Callable`, `Nullary`, `Unary`) — those live in
  `function`
- Object transforms (`pick`, `omit`, `flatten`, `keyefy`) — those live in
  `table`; this module only names object shapes
