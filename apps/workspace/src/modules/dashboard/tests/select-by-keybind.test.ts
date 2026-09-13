import * as Vitest from '@effect/vitest';
import * as Dashboard from '../index.js';

Vitest.describe('Dashboard.selectByKeybind runtime', () => {
  Vitest.it('returns the bound panel', () => {
    Vitest.expect(Dashboard.selectByKeybind(Dashboard.DEFAULT_LAYOUT, 'p')).toStrictEqual(
      'prompts',
    );
  });

  Vitest.it('is undefined for unbound keys', () => {
    Vitest.expect(Dashboard.selectByKeybind(Dashboard.DEFAULT_LAYOUT, 'q')).toStrictEqual(
      undefined,
    );
  });
});
