import * as Vitest from '@effect/vitest';

import * as Format from '../index.js';

Vitest.describe('Format.bold runtime', () => {
  Vitest.it('wraps text in the bold sequence', () => {
    const result = Format.make('hi').pipe(Format.bold, Format.compile);
    Vitest.expect(result).toBe('\x1b[1mhi\x1b[0m');
  });

  Vitest.it('leaves the input untouched', () => {
    const original = Format.make('hi');
    const bolded = Format.bold(original);
    Vitest.expect(Format.compile(original)).toBe('hi');
    Vitest.expect(Format.compile(bolded)).toBe('\x1b[1mhi\x1b[0m');
  });

  Vitest.it('bolds already colored text', () => {
    const result = Format.make('hi').pipe(Format.color('red'), Format.bold, Format.compile);
    Vitest.expect(result).toBe('\x1b[1m\x1b[31mhi\x1b[0m\x1b[0m');
  });
});
