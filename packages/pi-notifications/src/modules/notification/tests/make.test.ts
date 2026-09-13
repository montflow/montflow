import * as Vitest from '@effect/vitest';
import * as Notification from '../index.js';

Vitest.describe('Notification.make', () => {
  Vitest.it('creates a notification on the given channel', () => {
    Vitest.expect(
      Notification.make({ title: 'Build done', body: 'All checks passed.', channel: 'push' }),
    ).toStrictEqual({
      title: 'Build done',
      body: 'All checks passed.',
      channel: 'push',
    });
  });

  Vitest.it('defaults to the desktop channel', () => {
    Vitest.expect(Notification.make({ title: 'Hello', body: 'World' }).channel).toBe('desktop');
  });
});
