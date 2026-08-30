```typescript
import { Brand } from "effect";
import { PositiveNumber } from "../positive-number/index.js";
import { Int } from "../int/index.js";

export const Id = "PositiveInt";
export type Id = typeof Id;

export const make = Brand.all(PositiveNumber.make, Int.make);
export type PositiveInt = Brand.Brand.FromConstructor<typeof make>;

export const makeUnsafe = Brand.nominal<PositiveInt>();
```
