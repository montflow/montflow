import * as Vitest from '@effect/vitest';
import * as Dashboard from '../index.js';

Vitest.describe('Dashboard.firstPanel runtime', () => {
  Vitest.it('reads the first cell panel', () => {
    Vitest.expect(Dashboard.firstPanel(Dashboard.DEFAULT_LAYOUT)).toStrictEqual('info');
  });
});
