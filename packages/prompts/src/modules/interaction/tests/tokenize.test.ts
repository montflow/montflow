import * as Vitest from '@effect/vitest';
import * as Interaction from '../index.js';

Vitest.describe('Interaction.tokenize', () => {
  Vitest.it('splits on whitespace', () => {
    Vitest.expect(Interaction.tokenize('browse foo')).toStrictEqual(['browse', 'foo']);
    Vitest.expect(Interaction.tokenize('')).toStrictEqual([]);
    Vitest.expect(Interaction.tokenize('   ')).toStrictEqual([]);
  });

  Vitest.it('keeps quoted spans together with quotes stripped', () => {
    Vitest.expect(Interaction.tokenize('create "my profile"')).toStrictEqual([
      'create',
      'my profile',
    ]);
    Vitest.expect(Interaction.tokenize("show 'my prompt'")).toStrictEqual(['show', 'my prompt']);
  });
});
