import * as Vitest from '@effect/vitest';
import * as SkillFilter from '../index.js';

Vitest.describe('SkillFilter.matchesFilter runtime', () => {
  Vitest.it('matches empty queries and case-insensitive subsequences', () => {
    Vitest.expect(SkillFilter.matchesFilter('Cooking Pasta', '')).toStrictEqual(true);
    Vitest.expect(SkillFilter.matchesFilter('Cooking Pasta', 'ckpa')).toStrictEqual(true);
    Vitest.expect(SkillFilter.matchesFilter('Cooking Pasta', 'PASTA')).toStrictEqual(true);
  });

  Vitest.it('rejects out-of-order characters', () => {
    Vitest.expect(SkillFilter.matchesFilter('Cooking Pasta', 'zx')).toStrictEqual(false);
    Vitest.expect(SkillFilter.matchesFilter('abc', 'cba')).toStrictEqual(false);
  });

  Vitest.it('tolerates typos via Fuse', () => {
    Vitest.expect(SkillFilter.matchesFilter('Cooking Pasta', 'psta')).toStrictEqual(true);
    Vitest.expect(SkillFilter.matchesFilter('Effect Testing', 'efekt testing')).toStrictEqual(true);
  });
});
