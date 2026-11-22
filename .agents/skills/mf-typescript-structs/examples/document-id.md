```typescript
import { Brand } from "effect";

export const Id = "DocumentId";
export type Id = typeof Id;

export type DocumentId = string & Brand.Brand<Id>;

export const REGEX = /^[0-9a-f]{24}$/;

export const check = (str: string) =>
  REGEX.test(str) ? true : "DocumentId must be a 24-character hex string";

export const makeUnsafe = Brand.nominal<DocumentId>();
export const make = Brand.make<DocumentId>(check);
```
