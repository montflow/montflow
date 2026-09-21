# brand-ext module

Helpers for building branded structs: they collapse the repeated
validation and type-alias boilerplate every struct under `structs/`
otherwise hand-writes. The `Blueprint` schema itself is still inlined, since
`Schema.fromBrand` needs a concrete brand identifier to infer.

## Belongs here

- `check` — builds a `(value) => true | string` brand check from a predicate + message
- `Base` — the branded form of a primitive (`T & Brand.Brand<Id>`)
- `Check` — the validation shape accepted by `Brand.make`

## Does not belong here

- The branded types themselves — each lives in its own `structs/[name]/` module
- Primitive predicates (`isInt`, `isFloat`, ...) — those live in `numeric` / `number-ext`
- Struct composition (`Brand.all`) — call it directly in the composed struct module
