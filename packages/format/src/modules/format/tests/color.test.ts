import * as Vitest from '@effect/vitest';

import { Color } from '../../../structs/index.js';
import * as Format from '../index.js';

Vitest.describe('Format.color types', () => {
  Vitest.it('accepts a label or a branded color', () => {
    const fromLabel = Format.make('hi').pipe(Format.color('cyan'), Format.compile);
    const fromBrand = Format.make('hi').pipe(Format.color(Color.black()), Format.compile);
    Vitest.expectTypeOf(fromLabel).toBeString();
    Vitest.expectTypeOf(fromBrand).toBeString();
  });

  Vitest.it('rejects unknown labels', () => {
    // @ts-expect-error - 'blurple' is not a Color.Input
    Format.color('blurple');
  });
});

Vitest.describe('Format.color runtime', () => {
  Vitest.it('wraps text in the color sequence for a branded color', () => {
    const result = Format.make('hi').pipe(Format.color(Color.red()), Format.compile);
    Vitest.expect(result).toBe('\x1b[31mhi\x1b[0m');
  });

  Vitest.it('wraps text in the color sequence for a plain label', () => {
    const result = Format.make('hi').pipe(Format.color('cyan'), Format.compile);
    Vitest.expect(result).toBe('\x1b[36mhi\x1b[0m');
  });

  Vitest.it('nests inside bold', () => {
    const result = Format.make('start').pipe(
      Format.bold,
      Format.color(Color.black()),
      Format.compile,
    );
    Vitest.expect(result).toBe('\x1b[30m\x1b[1mstart\x1b[0m\x1b[0m');
  });

  Vitest.it('nests outside bold', () => {
    const result = Format.make('start').pipe(Format.color('green'), Format.bold, Format.compile);
    Vitest.expect(result).toBe('\x1b[1m\x1b[32mstart\x1b[0m\x1b[0m');
  });

  Vitest.it('supports the data-first (direct) call style', () => {
    const direct = Format.color(Format.make('hi'), 'cyan');
    const curried = Format.color('cyan')(Format.make('hi'));
    Vitest.expect(Format.compile(direct)).toBe('\x1b[36mhi\x1b[0m');
    Vitest.expect(Format.compile(direct)).toBe(Format.compile(curried));
  });

  Vitest.it('leaves the input untouched', () => {
    const original = Format.make('hi');
    const colored = Format.color('red')(original);
    Vitest.expect(Format.compile(original)).toBe('hi');
    Vitest.expect(Format.compile(colored)).toBe('\x1b[31mhi\x1b[0m');
  });
});
