import { test, expect } from 'vitest';
import { RunStats } from '../run-stats';

// ─── RunStats ────────────────────────────────────────────────────────

test('RunStats: accumulates usage and cost across turns', () => {
  const stats = new RunStats(1_000_000);
  stats.addUsage({ input: 100, output: 50, cacheRead: 10, cacheWrite: 0, cost: { total: 0.42 } });
  stats.addUsage({ input: 200, output: 100, cacheRead: 0, cacheWrite: 5, cost: { total: 0.58 } });
  // A provider that reports no cost contributes zero dollars.
  stats.addUsage({ input: 10, output: 5, cacheRead: 0, cacheWrite: 0 });

  expect(stats.startedAt).toBe(1_000_000);
  expect(stats.totalTurns).toBe(3);
  expect(stats.totalCost).toBe(1.0);
  expect(stats.totalTokens).toBe(100 + 50 + 10 + 200 + 100 + 5 + 10 + 5);
});

test('RunStats: fresh stats are zero', () => {
  const stats = new RunStats();
  expect(stats.totalTurns).toBe(0);
  expect(stats.totalCost).toBe(0);
  expect(stats.totalTokens).toBe(0);
  expect(typeof stats.startedAt).toBe('number');
});
