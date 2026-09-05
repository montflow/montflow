import { Option, Result } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Color from '../index.js';

Vitest.describe('Color.make types', () => {
  Vitest.it('returns the branded color', () => {
    Vitest.expectTypeOf(Color.make('cyan')).toEqualTypeOf<Color.Color>();
  });

  Vitest.it('makeUnsafe returns the branded color without checks', () => {
    Vitest.expectTypeOf(Color.makeUnsafe('cyan')).toEqualTypeOf<Color.Color>();
  });
});

Vitest.describe('Color.make runtime', () => {
  Vitest.it('brands each label', () => {
    for (const label of Color.LABELS) {
      Vitest.expect(Color.make(label)).toBe(label);
    }
  });

  Vitest.it('throws on invalid input', () => {
    Vitest.expect(() => Color.make('blurple')).toThrow();
  });

  Vitest.it('exposes option, result, and is forms', () => {
    Vitest.expect(Option.isSome(Color.make.option('cyan'))).toBe(true);
    Vitest.expect(Option.isNone(Color.make.option('blurple'))).toBe(true);
    Vitest.expect(Result.isSuccess(Color.make.result('cyan'))).toBe(true);
    Vitest.expect(Result.isFailure(Color.make.result('blurple'))).toBe(true);
    Vitest.expect(Color.make.is('cyan')).toBe(true);
    Vitest.expect(Color.make.is('blurple')).toBe(false);
  });

  Vitest.it('makeUnsafe brands without validation', () => {
    Vitest.expect(Color.makeUnsafe('cyan')).toBe('cyan');
  });
});
