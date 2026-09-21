# Int struct

Branded integer: the `Int` brand (`number & Brand<"Int">`) plus its
validation (`check`, `make`, `makeUnsafe`, `Blueprint`) and the
`fromNumber` / `toNumber` conversions. Rejects non-numbers, non-integers,
`NaN`, and infinities.

## Belongs here

- `Int` brand, `Id`, `check`, `make`, `makeUnsafe`, `Blueprint`
- `fromNumber` (validated) / `toNumber`

## Does not belong here

- Sign or divisibility predicates — that is `numeric` / `number-ext`
- `Float` or composed numeric brands — their own structs under `structs/`
