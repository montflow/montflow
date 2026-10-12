import { describe, expect, it } from 'vitest';
import { isValidSessionId, slugifyName } from '../sessions.services.module.js';

describe('slugifyName', () => {
  it('lowercases and hyphenates the name with a time suffix', () => {
    expect(slugifyName('Fix Login Flow', 0)).toBe('fix-login-flow-0');
  });

  it('falls back to session for blank names', () => {
    expect(slugifyName('!!!', 1)).toBe('session-1');
  });

  it('caps the base at 48 chars', () => {
    const slug = slugifyName('a'.repeat(100), 0);
    expect(slug.startsWith('a'.repeat(48))).toBe(true);
    expect(slug.length).toBe(48 + 1 + 1);
  });

  it('does not collide same-named sessions a modulo cycle apart', () => {
    const cycle = 36 ** 4;
    expect(slugifyName('Fix Login Flow', 0)).not.toBe(slugifyName('Fix Login Flow', cycle));
  });
});

describe('isValidSessionId', () => {
  it('accepts slug output', () => {
    expect(isValidSessionId(slugifyName('Fix Login Flow', 42))).toBe(true);
  });

  it('rejects traversal and blanks', () => {
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId('../escape')).toBe(false);
    expect(isValidSessionId('BAD ID!')).toBe(false);
  });
});
