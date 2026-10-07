import * as Vitest from '@effect/vitest';
import * as Dashboard from '../index.js';

const sum = (rows: ReadonlyArray<number>): number => rows.reduce((total, row) => total + row, 0);

Vitest.describe('Dashboard.cellRows', () => {
  Vitest.it('splits the column budget into whole rows that sum exactly', () => {
    const rows = Dashboard.cellRows([3, 2, 2], 38, 1);
    Vitest.expect(rows).toStrictEqual([15, 11, 10]);
    Vitest.expect(sum(rows)).toStrictEqual(36);
    Vitest.expect(rows.every(Number.isInteger)).toStrictEqual(true);
  });

  Vitest.it('keeps every cell at one row minimum when the budget is tiny', () => {
    const rows = Dashboard.cellRows([1, 2, 1], 3, 1);
    Vitest.expect(rows).toStrictEqual([1, 1, 1]);
    Vitest.expect(sum(rows)).toStrictEqual(3);
  });

  Vitest.it('matches the default layout split at 40 rows', () => {
    Vitest.expect(Dashboard.cellRows([1, 2, 1], 38, 1)).toStrictEqual([9, 18, 9]);
    Vitest.expect(Dashboard.cellRows([3, 2, 2], 38, 1)).toStrictEqual([15, 11, 10]);
  });

  Vitest.it('returns nothing for a column with no cells', () => {
    Vitest.expect(Dashboard.cellRows([], 20, 1)).toStrictEqual([]);
  });
});
