import { Brand, Schema } from 'effect';

import * as BrandExt from '../../modules/brand-ext/index.js';

export const Id = 'Int';
export type Id = typeof Id;

export type Int = BrandExt.Base<Id, number>;

export const check = BrandExt.check(Number.isInteger, 'Int must be an integer');

export const makeUnsafe = Brand.nominal<Int>();
export const make = Brand.make<Int>(check);

export const fromNumber = (num: number): Int => make(num);
export const toNumber = (n: Int): number => n;

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
