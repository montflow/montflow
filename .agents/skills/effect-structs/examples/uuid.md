```typescript
import { Brand, Schema } from "effect";

export const Id = "Uuid";
export type Id = typeof Id;

export type Uuid = string & Brand.Brand<Id>;

export const REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const check = (str: string) =>
  REGEX.test(str) ? true : "Uuid must be a valid UUID v4";

export const makeUnsafe = Brand.nominal<Uuid>();
export const make = Brand.make<Uuid>(check);

export const fromRandom = () =>
  crypto.randomUUID() as Uuid;

export const Blueprint = Schema.String.pipe(Schema.fromBrand(Id, make));
```
