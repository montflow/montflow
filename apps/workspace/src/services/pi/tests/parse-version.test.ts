import * as Vitest from '@effect/vitest';
import * as Pi from '../index.js';

Vitest.describe('Pi.parseVersion runtime', () => {
  Vitest.it('trims output and flags blanks', () => {
    Vitest.expect(Pi.parseVersion('0.84.2\n')).toStrictEqual('0.84.2');
    Vitest.expect(Pi.parseVersion('  \n')).toStrictEqual('unknown');
  });
});
