import { describe, expect, it } from 'vitest';
import { isValidRunId, slugifyName } from '../runs.services.module.js';

describe('slugifyName', () => {
  it('lowercases and hyphenates the name with a time suffix', () => {
    expect(slugifyName('Fix Login Flow', 0)).toBe('fix-login-flow-0000');
  });

  it('falls back to run for blank names', () => {
    expect(slugifyName('!!!', 1)).toBe('run-0001');
  });

  it('caps the base at 48 chars', () => {
    const slug = slugifyName('a'.repeat(100), 0);
    expect(slug.startsWith('a'.repeat(48))).toBe(true);
    expect(slug.length).toBe(48 + 1 + 4);
  });
});

describe('isValidRunId', () => {
  it('accepts slug output', () => {
    expect(isValidRunId(slugifyName('Fix Login Flow', 42))).toBe(true);
  });

  it('rejects traversal and blanks', () => {
    expect(isValidRunId('')).toBe(false);
    expect(isValidRunId('../escape')).toBe(false);
    expect(isValidRunId('BAD ID!')).toBe(false);
  });
});
