import { Brand, Schema } from 'effect';

import * as BrandExt from '../../modules/brand-ext/index.js';

export const Id = 'PositiveNumber';
export type Id = typeof Id;

export type PositiveNumber = BrandExt.Base<Id, number>;

export const check = BrandExt.check(
  (num) => typeof num === 'number' && Number.isFinite(num) && num > 0,
  'PositiveNumber must be a positive finite number',
);

export const makeUnsafe = Brand.nominal<PositiveNumber>();
export const make = Brand.make<PositiveNumber>(check);

export const fromNumber = (num: number): PositiveNumber => make(num);
export const toNumber = (n: PositiveNumber): number => n;

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
