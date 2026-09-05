import * as Vitest from '@effect/vitest';

import * as Format from '../index.js';

Vitest.describe('Format.make runtime', () => {
  Vitest.it('holds the given text', () => {
    Vitest.expect(Format.compile(Format.make('hello'))).toBe('hello');
  });

  Vitest.it('preserves empty and unicode text', () => {
    Vitest.expect(Format.compile(Format.make(''))).toBe('');
    Vitest.expect(Format.compile(Format.make('héllo 🌈'))).toBe('héllo 🌈');
  });

  Vitest.it('creates distinct values', () => {
    Vitest.expect(Format.make('a')).not.toBe(Format.make('a'));
  });
});
