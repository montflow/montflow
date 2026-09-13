import * as Vitest from '@effect/vitest';
import * as Dashboard from '../index.js';

Vitest.describe('Dashboard.titleFor runtime', () => {
  Vitest.it('reads known titles and falls back to the id', () => {
    Vitest.expect(Dashboard.titleFor('skills')).toStrictEqual('Skills');
    Vitest.expect(Dashboard.titleFor('custom-pane')).toStrictEqual('custom-pane');
  });
});
