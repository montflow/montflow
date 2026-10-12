import { describe, expect, it } from 'vitest';
import { sanitizeSessionText } from '../sessions.services.module.js';

const ESC = String.fromCharCode(27);

describe('sanitizeSessionText', () => {
  it('strips ANSI escape sequences', () => {
    expect(sanitizeSessionText(`${ESC}[31mred${ESC}[0m`)).toBe('red');
  });

  it('replaces control characters including newlines and tabs with spaces', () => {
    expect(sanitizeSessionText('a\nb\tc')).toBe('a b c');
  });

  it('trims surrounding whitespace and leaves plain text untouched', () => {
    expect(sanitizeSessionText('  hello world  ')).toBe('hello world');
  });
});
