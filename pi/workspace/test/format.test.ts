import { test, expect } from 'vitest';
import { formatDuration } from '../format';

// ─── formatDuration ───────────────────────────────────────────────────

test('formatDuration: sub-second durations keep raw ms', () => {
  expect(formatDuration(0)).toBe('0ms');
  expect(formatDuration(50)).toBe('50ms');
  expect(formatDuration(499)).toBe('499ms');
  expect(formatDuration(999)).toBe('1 second');
});

test('formatDuration: seconds', () => {
  expect(formatDuration(1000)).toBe('1 second');
  expect(formatDuration(45000)).toBe('45 seconds');
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
