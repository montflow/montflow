import { Brand, Schema } from "effect";

export const Id = "[Name]";
export type Id = typeof Id;

export type [Name] = number & Brand.Brand<Id>;

export const check = (num: unknown): true | string => {
  if (typeof num !== "number" || !Number.isInteger(num)) {
    return "[Name] must be an integer";
  }
  return true;
};

export const makeUnsafe = Brand.nominal<[Name]>();
export const make = Brand.make<[Name]>(check);

export const fromNumber = (num: number): [Name] => makeUnsafe(num);
export const toNumber = (n: [Name]): number => n;

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
