import { Exit, Schema } from 'effect';
import * as Vitest from '@effect/vitest';

import * as Color from '../index.js';

Vitest.describe('Color.Blueprint runtime', () => {
  Vitest.it('decodes a label into a branded color', () => {
    const decoded = Schema.decodeUnknownExit(Color.Blueprint)('green');
    Vitest.expect(decoded).toStrictEqual(Exit.succeed(Color.green()));
  });

  Vitest.it('rejects strings outside the labels', () => {
    const decoded = Schema.decodeUnknownExit(Color.Blueprint)('blurple');
    Vitest.expect(Exit.isFailure(decoded)).toBe(true);
  });

  Vitest.it('rejects non-strings', () => {
    const decoded = Schema.decodeUnknownExit(Color.Blueprint)(30);
    Vitest.expect(Exit.isFailure(decoded)).toBe(true);
  });

  Vitest.it('encodes a branded color back to its label', () => {
    const encoded = Schema.encodeUnknownExit(Color.Blueprint)(Color.blue());
    Vitest.expect(encoded).toStrictEqual(Exit.succeed('blue'));
  });
});
