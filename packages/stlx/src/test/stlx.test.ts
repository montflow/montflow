import { describe, expect, it } from 'vitest';

import { stlx } from '../index.js';

describe('stlx (runtime)', () => {
  it('merges Tailwind classes correctly', () => {
    const result = stlx('px-2 py-1', 'px-4');
    expect(result).toBe('py-1 px-4');
  });

  it('handles conditional classes', () => {
    const disabled = false;
    const enabled = true;
    const result = stlx('text-sm', disabled && 'text-lg', enabled && 'font-bold');
    expect(result).toBe('text-sm font-bold');
  });

  it('handles nested arrays', () => {
    const result = stlx(['text-sm', 'text-red-500'], ['bg-blue-500', 'p-4']);
    expect(result).toBe('text-sm text-red-500 bg-blue-500 p-4');
  });

  it('handles empty inputs', () => {
    const result = stlx();
    expect(result).toBe('');
  });

  it('handles mixed inputs', () => {
    const hidden = false;
    const result = stlx('text-sm', ['text-red-500', 'bg-blue-500'], hidden && 'hidden');
    expect(result).toBe('text-sm text-red-500 bg-blue-500');
  });
});

describe('stlx (types)', () => {
  it('infers correct types for string inputs', () => {
    const result: string = stlx('text-sm', 'text-red-500');
    expect(result).toBeTypeOf('string');
  });

  it('infers correct types for conditional classes', () => {
    const disabled = false;
    const enabled = true;
    const result: string = stlx('text-sm', disabled && 'text-lg', enabled && 'font-bold');
    expect(result).toBeTypeOf('string');
  });

  it('infers correct types for nested arrays', () => {
    const result: string = stlx(['text-sm', 'text-red-500'], ['bg-blue-500', 'p-4']);
    expect(result).toBeTypeOf('string');
  });

  it('infers correct types for mixed inputs', () => {
    const hidden = false;
    const result: string = stlx('text-sm', ['text-red-500', 'bg-blue-500'], hidden && 'hidden');
    expect(result).toBeTypeOf('string');
  });
});
