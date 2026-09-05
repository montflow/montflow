import * as Vitest from '@effect/vitest';

import * as Color from '../index.js';

Vitest.describe('Color constructors types', () => {
  Vitest.it('return branded colors', () => {
    Vitest.expectTypeOf(Color.black()).toEqualTypeOf<Color.Color>();
    Vitest.expectTypeOf(Color.white()).toEqualTypeOf<Color.Color>();
  });
});

Vitest.describe('Color constructors runtime', () => {
  Vitest.it('returns its own label', () => {
    Vitest.expect(Color.black()).toBe('black');
    Vitest.expect(Color.red()).toBe('red');
    Vitest.expect(Color.green()).toBe('green');
    Vitest.expect(Color.yellow()).toBe('yellow');
    Vitest.expect(Color.blue()).toBe('blue');
    Vitest.expect(Color.magenta()).toBe('magenta');
    Vitest.expect(Color.cyan()).toBe('cyan');
    Vitest.expect(Color.white()).toBe('white');
    Vitest.expect(Color.gray()).toBe('gray');
  });

  Vitest.it('round-trips through code', () => {
    Vitest.expect(Color.code(Color.cyan())).toBe(Color.codes.cyan);
  });
});
