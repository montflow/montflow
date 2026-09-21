# PositiveNumber struct

Branded positive finite number: the `PositiveNumber` brand
(`number & Brand<"PositiveNumber">`) plus its validation (`check`, `make`,
`makeUnsafe`, `Blueprint`) and the `fromNumber` / `toNumber` conversions.
Accepts any finite number strictly greater than zero, integer or not.

## Belongs here

- `PositiveNumber` brand, `Id`, `check`, `make`, `makeUnsafe`, `Blueprint`
- `fromNumber` (validated) / `toNumber`

## Does not belong here

- Integer-only positivity — that is `positive-int` (`PositiveNumber` × `Int`)
- General sign predicates — that is `numeric` / `number-ext`
