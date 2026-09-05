import * as Vitest from '@effect/vitest';

import * as Format from '../index.js';

Vitest.describe('Format.compile runtime', () => {
  Vitest.it('renders the formatted text', () => {
    const result = Format.make('hi').pipe(Format.bold, Format.compile);
    Vitest.expect(result).toBe('\x1b[1mhi\x1b[0m');
  });

  Vitest.it('returns plain text untouched', () => {
    Vitest.expect(Format.compile(Format.make('plain'))).toBe('plain');
  });
});
