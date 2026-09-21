import { type Brand } from 'effect';
import * as Vitest from '@effect/vitest';

import * as BrandExt from '../index.js';

Vitest.describe('BrandExt.Base types', () => {
  Vitest.it('intersects the primitive with the brand', () => {
    Vitest.expectTypeOf<BrandExt.Base<'Test', string>>().toEqualTypeOf<
      string & Brand.Brand<'Test'>
    >();
  });
});
