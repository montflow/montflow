# PositiveInt struct

Composed brand: `PositiveInt` is `PositiveNumber` × `Int`, built with
`Brand.all`. The brand, `make`, `makeUnsafe`, and `Blueprint` are the whole
surface — there is no `check` because the composed constructor carries the
checks of both parents.

## Belongs here

- `PositiveInt` brand, `Id`, `make`, `makeUnsafe`, `Blueprint`

## Does not belong here

- A hand-written `check` — composition handles validation
- Non-integer positivity — that is `positive-number`
