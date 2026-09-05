import * as Vitest from '@effect/vitest';

import * as Color from '../index.js';

Vitest.describe('Color.Label types', () => {
  Vitest.it('accepts each of the nine labels', () => {
    const labels: Array<Color.Label> = [
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'gray',
    ];
    Vitest.expectTypeOf(labels).toEqualTypeOf<Array<Color.Label>>();
  });

  Vitest.it('rejects strings outside the nine labels', () => {
    // @ts-expect-error - 'blurple' is not a valid label
    const label: Color.Label = 'blurple';
    Vitest.expect(label).toBe('blurple');
  });
});

Vitest.describe('Color.Label runtime', () => {
  Vitest.it('lists exactly the nine labels', () => {
    Vitest.expect(Color.LABELS).toStrictEqual([
      'black',
      'red',
      'green',
      'yellow',
      'blue',
      'magenta',
      'cyan',
      'white',
      'gray',
    ]);
  });
});

Vitest.describe('Color.Input types', () => {
  Vitest.it('accepts a plain label', () => {
    const input: Color.Input = 'cyan';
    Vitest.expect(input).toBe('cyan');
  });

  Vitest.it('accepts a branded color', () => {
    const input: Color.Input = Color.black();
    Vitest.expect(input).toBe('black');
  });

  Vitest.it('rejects strings outside the labels', () => {
    // @ts-expect-error - 'blurple' is neither a label nor a branded color
    const input: Color.Input = 'blurple';
    Vitest.expect(input).toBe('blurple');
  });
});
