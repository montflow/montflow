import { Brand, Schema } from 'effect';

import * as Int from '../int/index.js';
import * as PositiveNumber from '../positive-number/index.js';

export const Id = 'PositiveInt';
export type Id = typeof Id;

export const make = Brand.all(PositiveNumber.make, Int.make);
export type PositiveInt = Brand.Brand.FromConstructor<typeof make>;

export const makeUnsafe = Brand.nominal<PositiveInt>();

export const Blueprint = Schema.Number.pipe(Schema.fromBrand(Id, make));
