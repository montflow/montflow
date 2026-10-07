import { Brand, Schema } from "effect";
import { ExistingA } from "../existing-a/index.js";
import { ExistingB } from "../existing-b/index.js";

export const Id = "[Name]";
export type Id = typeof Id;

export const make = Brand.all(ExistingA.make, ExistingB.make);
export type [Name] = Brand.Brand.FromConstructor<typeof make>;

export const makeUnsafe = Brand.nominal<[Name]>();

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
