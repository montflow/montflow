import * as Vitest from '@effect/vitest';
import * as Notification from '../index.js';

Vitest.describe('Notification.isValidChannel', () => {
  Vitest.it('accepts phone, push, and desktop', () => {
    Vitest.expect(Notification.isValidChannel('phone')).toBe(true);
    Vitest.expect(Notification.isValidChannel('push')).toBe(true);
    Vitest.expect(Notification.isValidChannel('desktop')).toBe(true);
  });

  Vitest.it('rejects unknown channels', () => {
    Vitest.expect(Notification.isValidChannel('email')).toBe(false);
    Vitest.expect(Notification.isValidChannel('')).toBe(false);
  });
});
