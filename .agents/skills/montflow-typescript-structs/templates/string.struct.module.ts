import { Brand, Schema } from "effect";

export const Id = "[Name]";
export type Id = typeof Id;

export type [Name] = string & Brand.Brand<Id>;

export const REGEX = /.../;

export const check = (str: string) =>
  REGEX.test(str) ? true : "Invalid [name]";

export const makeUnsafe = Brand.nominal<[Name]>();
export const make = Brand.make<[Name]>(check);

export const Blueprint = Schema.String.pipe(Schema.fromBrand(Id, make));
