import * as Vitest from '@effect/vitest';
import * as Dashboard from '../index.js';

Vitest.describe('Dashboard.flatten runtime', () => {
  Vitest.it('reads cells column by column', () => {
    const panels = Dashboard.flatten(Dashboard.DEFAULT_LAYOUT).map((cell) => cell.panel);

    Vitest.expect(panels).toStrictEqual(['info', 'skills', 'prompts', 'runs', 'profiles']);
  });
});
