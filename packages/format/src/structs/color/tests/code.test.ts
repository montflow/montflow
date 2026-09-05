import * as Vitest from '@effect/vitest';

import * as Color from '../index.js';

Vitest.describe('Color.code types', () => {
  Vitest.it('requires a branded color, not a raw label', () => {
    // @ts-expect-error - labels must be branded through make or a constructor first
    Color.code('cyan');
  });
});

Vitest.describe('Color.code runtime', () => {
  Vitest.it('maps every label to its ANSI code', () => {
    Vitest.expect(Color.codes).toStrictEqual({
      black: 30,
      red: 31,
      green: 32,
      yellow: 33,
      blue: 34,
      magenta: 35,
      cyan: 36,
      white: 37,
      gray: 90,
    });
  });

  Vitest.it('looks up codes for branded colors', () => {
    Vitest.expect(Color.code(Color.red())).toBe(31);
    Vitest.expect(Color.code(Color.make('gray'))).toBe(90);
  });
});
