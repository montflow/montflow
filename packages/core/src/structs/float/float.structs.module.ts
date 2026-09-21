import { Brand, Schema } from 'effect';

import * as BrandExt from '../../modules/brand-ext/index.js';

export const Id = 'Float';
export type Id = typeof Id;

export type Float = BrandExt.Base<Id, number>;

export const check = BrandExt.check(
  (num) => Number.isFinite(num) && !Number.isInteger(num),
  'Float must be a finite non-integer',
);

export const makeUnsafe = Brand.nominal<Float>();
export const make = Brand.make<Float>(check);

export const fromNumber = (num: number): Float => make(num);
export const toNumber = (n: Float): number => n;

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
