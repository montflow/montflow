import { test, expect } from 'vitest';
import { formatCost, formatDuration } from '../format';

// ─── formatDuration ───────────────────────────────────────────────────

test('formatDuration: sub-second durations keep raw ms', () => {
  expect(formatDuration(0)).toBe('0ms');
  expect(formatDuration(50)).toBe('50ms');
  // Rounding to the nearest second keeps sub-500ms values in ms form.
  expect(formatDuration(499)).toBe('499ms');
  // At 500ms+ it rounds up to 1 second — timeout messages stay readable.
  expect(formatDuration(999)).toBe('1 second');
});

test('formatDuration: seconds', () => {
  expect(formatDuration(1000)).toBe('1 second');
  expect(formatDuration(45000)).toBe('45 seconds');
  // Rounds to the nearest second.
  expect(formatDuration(1500)).toBe('2 seconds');
});

test('formatDuration: minutes', () => {
  expect(formatDuration(60000)).toBe('1 minute');
  expect(formatDuration(600000)).toBe('10 minutes');
  expect(formatDuration(1_200_000)).toBe('20 minutes');
  expect(formatDuration(900000)).toBe('15 minutes');
});

test('formatDuration: hours, with a minute remainder only when significant', () => {
  expect(formatDuration(3600000)).toBe('1 hour');
  expect(formatDuration(5_400_000)).toBe('1 hour 30 minutes');
  expect(formatDuration(9_000_000)).toBe('2 hours 30 minutes');
});

test('formatDuration: clamps negative durations', () => {
  expect(formatDuration(-5)).toBe('0ms');
});

// ─── formatCost ───────────────────────────────────────────────────────

test('formatCost: formats dollar amounts', () => {
  expect(formatCost(0)).toBe('$0.00');
  expect(formatCost(0.42)).toBe('$0.42');
  expect(formatCost(12.5)).toBe('$12.50');
  // Sub-cent costs keep four decimals so they don't round to a fake $0.00.
  expect(formatCost(0.0042)).toBe('$0.0042');
  expect(formatCost(-3)).toBe('$0.00');
});
