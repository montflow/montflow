# Float struct

Branded finite non-integer: the `Float` brand (`number & Brand<"Float">`)
plus its validation (`check`, `make`, `makeUnsafe`, `Blueprint`) and the
`fromNumber` / `toNumber` conversions. Rejects integers, `NaN`, and
infinities — `Int` and `Float` are disjoint.

## Belongs here

- `Float` brand, `Id`, `check`, `make`, `makeUnsafe`, `Blueprint`
- `fromNumber` (validated) / `toNumber`

## Does not belong here

- Integer brands — that is `int` (`Int` is a whole number, not a `Float`)
- Sign predicates — that is `numeric` / `number-ext`
