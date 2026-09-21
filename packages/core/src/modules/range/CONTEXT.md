# range module

Bounded numeric intervals in object (`{ min, max }`) or tuple (`[min, max]`)
form. This module owns the representation and its validity rules; `numeric`
consumes it for checks like `clamp` and `isBetween`.

## Belongs here

- The `Range` union plus `Object` / `Tuple` representations
- Guards and conversions — `isObject`, `isTuple`, `isRange`, `toObject`,
  `toTuple`
- Constructors and accessors — `make`, `of`, `min`, `max`, `symetric`
- `isValid` validation and `InvalidRangeError`

## Does not belong here

- Numeric predicates (`isNumber`, `isInt`, `isBetween`, `clamp`) — those live
  in `numeric`
- Iterating or materializing a sequence of numbers — this is a bounds type,
  not a generator
- Date or time ranges — those would be a separate module
