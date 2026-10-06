import * as Vitest from '@effect/vitest';
import { PREVIEW_BUDGET_RATIO, markdownWindow } from '../markdown-window.js';

const lines = (count: number): ReadonlyArray<string> =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`);

Vitest.describe('markdownWindow runtime', () => {
  Vitest.it('preview spends a fraction of the budget and honours the offset', () => {
    const window = markdownWindow(lines(40), 'preview', 10, 20);
    Vitest.expect(PREVIEW_BUDGET_RATIO).toBeLessThan(1);
    Vitest.expect(window.budget).toBe(Math.floor(20 * PREVIEW_BUDGET_RATIO));
    // A small preview still pages: the offset moves, clamped to the end.
    Vitest.expect(window.offset).toBe(10);
    Vitest.expect(window.shown).toHaveLength(window.budget);
    Vitest.expect(window.shown[0]).toBe('line 11');
    Vitest.expect(window.hidden).toBe(40 - window.budget - 10);
    Vitest.expect(window.total).toBe(40);
  });

  Vitest.it('preview pins an absolute size and still pages through it', () => {
    const window = markdownWindow(lines(40), 'preview', 30, 20, 8);
    Vitest.expect(window.budget).toBe(8);
    Vitest.expect(window.offset).toBe(30);
    Vitest.expect(window.shown[0]).toBe('line 31');
    Vitest.expect(window.hidden).toBe(2);
  });

  Vitest.it('preview clamps the offset so the last line stays reachable', () => {
    Vitest.expect(markdownWindow(lines(40), 'preview', 99, 20, 8).offset).toBe(32);
  });

  Vitest.it('preview keeps at least one line on a tiny panel', () => {
    const window = markdownWindow(lines(5), 'preview', 0, 1);
    Vitest.expect(window.budget).toBe(1);
    Vitest.expect(window.shown).toEqual(['line 1']);
  });

  Vitest.it('view spends the whole budget from the requested offset', () => {
    const window = markdownWindow(lines(40), 'view', 5, 10);
    Vitest.expect(window.budget).toBe(10);
    Vitest.expect(window.offset).toBe(5);
    Vitest.expect(window.shown[0]).toBe('line 6');
    Vitest.expect(window.shown).toHaveLength(10);
    Vitest.expect(window.hidden).toBe(25);
  });

  Vitest.it('view clamps the offset so the last line stays reachable', () => {
    const window = markdownWindow(lines(12), 'view', 99, 10);
    Vitest.expect(window.offset).toBe(2);
    Vitest.expect(window.shown[0]).toBe('line 3');
    Vitest.expect(window.shown.at(-1)).toBe('line 12');
    Vitest.expect(window.hidden).toBe(0);
  });

  Vitest.it('clamps negative offsets to the top', () => {
    const window = markdownWindow(lines(12), 'view', -4, 10);
    Vitest.expect(window.offset).toBe(0);
    Vitest.expect(window.shown[0]).toBe('line 1');
  });

  Vitest.it('reports an empty window when there are no lines', () => {
    const window = markdownWindow([], 'preview', 0, 20);
    Vitest.expect(window.shown).toEqual([]);
    Vitest.expect(window.hidden).toBe(0);
    Vitest.expect(window.total).toBe(0);
  });
});
