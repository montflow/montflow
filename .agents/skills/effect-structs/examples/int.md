```typescript
import { Brand, Schema } from "effect";

export const Id = "Int";
export type Id = typeof Id;

export type Int = number & Brand.Brand<Id>;

export const check = (num: unknown): true | string => {
  if (typeof num !== "number" || !Number.isInteger(num)) {
    return "Int must be an integer";
  }
  return true;
};

export const makeUnsafe = Brand.nominal<Int>();
export const make = Brand.make<Int>(check);

export const fromNumber = (num: number): Int => makeUnsafe(num);
export const toNumber = (n: Int): number => n;

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
```
