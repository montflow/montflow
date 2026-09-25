import { describe, expect, it } from 'vitest';
import { sanitizeRunText } from '../runs.services.module.js';

const ESC = String.fromCharCode(27);

describe('sanitizeRunText', () => {
  it('strips ANSI escape sequences', () => {
    expect(sanitizeRunText(`${ESC}[31mred${ESC}[0m`)).toBe('red');
  });

  it('replaces control characters including newlines and tabs with spaces', () => {
    expect(sanitizeRunText('a\nb\tc')).toBe('a b c');
  });

  it('trims surrounding whitespace and leaves plain text untouched', () => {
    expect(sanitizeRunText('  hello world  ')).toBe('hello world');
  });
});
