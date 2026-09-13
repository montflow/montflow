import * as Vitest from '@effect/vitest';
import * as Dialogs from '../index.js';

Vitest.describe('Dialogs.tokenize', () => {
  Vitest.it('splits on whitespace', () => {
    Vitest.expect(Dialogs.tokenize('browse foo')).toStrictEqual(['browse', 'foo']);
    Vitest.expect(Dialogs.tokenize('')).toStrictEqual([]);
    Vitest.expect(Dialogs.tokenize('   ')).toStrictEqual([]);
  });

  Vitest.it('keeps quoted spans together with quotes stripped', () => {
    Vitest.expect(Dialogs.tokenize('create "my profile"')).toStrictEqual(['create', 'my profile']);
    Vitest.expect(Dialogs.tokenize("show 'my prompt'")).toStrictEqual(['show', 'my prompt']);
  });
});
