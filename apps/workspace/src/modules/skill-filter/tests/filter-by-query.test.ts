import * as Vitest from '@effect/vitest';
import * as SkillFilter from '../index.js';

const rows = (): ReadonlyArray<SkillFilter.Filterable> => [
  { id: 'effect-testing', name: 'Effect Testing', description: 'unit tests for modules' },
  { id: 'cooking-pasta', name: 'Cooking Pasta', description: 'al dente timing' },
];

Vitest.describe('SkillFilter.filterByQuery types', () => {
  Vitest.it('returns filterable rows', () => {
    const result = SkillFilter.filterByQuery(rows(), '');
    Vitest.expectTypeOf(result).toEqualTypeOf<ReadonlyArray<SkillFilter.Filterable>>();
  });
});

Vitest.describe('SkillFilter.filterByQuery runtime', () => {
  Vitest.it('keeps everything on an empty query', () => {
    Vitest.expect(SkillFilter.filterByQuery(rows(), '').length).toStrictEqual(2);
  });

  Vitest.it('matches across name, id, and description', () => {
    Vitest.expect(SkillFilter.filterByQuery(rows(), 'pasta').length).toStrictEqual(1);
    Vitest.expect(SkillFilter.filterByQuery(rows(), 'effect-testing')[0]?.name).toStrictEqual(
      'Effect Testing',
    );
    Vitest.expect(SkillFilter.filterByQuery(rows(), 'al dente')[0]?.id).toStrictEqual(
      'cooking-pasta',
    );
  });

  Vitest.it('reads nothing on a miss', () => {
    Vitest.expect(SkillFilter.filterByQuery(rows(), 'zxqw').length).toStrictEqual(0);
  });

  Vitest.it('tolerates typos and ranks the best match first', () => {
    const ranked = SkillFilter.filterByQuery(rows(), 'efekt testing');
    Vitest.expect(ranked.map((row) => row.id)).toStrictEqual(['effect-testing']);
  });

  Vitest.it('prefers exact hits over fuzzy lookalikes', () => {
    Vitest.expect(SkillFilter.filterByQuery(rows(), 'test').map((row) => row.id)).toStrictEqual([
      'effect-testing',
    ]);
    Vitest.expect(SkillFilter.filterByQuery(rows(), 'psta').map((row) => row.id)).toStrictEqual([
      'cooking-pasta',
    ]);
  });
});
