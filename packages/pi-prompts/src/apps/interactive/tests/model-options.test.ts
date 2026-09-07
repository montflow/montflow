import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly inputs?: ReadonlyArray<string | undefined>;
  readonly searches?: ReadonlyArray<string | undefined>;
}): Interactive.InteractiveUi => {
  let si = 0;
  let ii = 0;
  let gi = 0;
  const base: Interactive.InteractiveUi = {
    select: () => Promise.resolve(answers.selects?.[si++]),
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(answers.inputs?.[ii++]),
    notify: () => {},
  };
  if (answers.searches === undefined) return base;
  return { ...base, searchSelect: () => Promise.resolve(answers.searches?.[gi++]) };
};

const models: ReadonlyArray<Interactive.ModelOption> = [
  { label: 'a/m', current: true },
  { label: 'b/n', current: false },
];

Vitest.describe('Interactive.matchesFilter', () => {
  Vitest.it('matches subsequences case-insensitively', () => {
    Vitest.expect(Interactive.matchesFilter('anthropic/claude-sonnet-4-5', 'snt')).toBe(true);
    Vitest.expect(Interactive.matchesFilter('anthropic/claude-sonnet-4-5', 'SONNET')).toBe(true);
  });

  Vitest.it('rejects out-of-order characters and blank-armors empty queries', () => {
    Vitest.expect(Interactive.matchesFilter('anthropic/claude', 'eht')).toBe(false);
    Vitest.expect(Interactive.matchesFilter('anthropic/claude', '')).toBe(true);
    Vitest.expect(Interactive.matchesFilter('anthropic/claude', '   ')).toBe(true);
  });
});

Vitest.describe('Interactive.modelOptions', () => {
  Vitest.it('puts the current model first without duplicates', () => {
    Vitest.expect(
      Interactive.modelOptions({ provider: 'a', id: 'm' }, [
        { provider: 'a', id: 'm' },
        { provider: 'b', id: 'n' },
      ]),
    ).toStrictEqual([
      { label: 'a/m', current: true },
      { label: 'b/n', current: false },
    ]);
  });
});

Vitest.describe('Interactive.pickModel', () => {
  Vitest.it.effect('returns the menu pick directly', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({ selects: ['a/m (current)'] });
      const label = yield* Interactive.pickModel(ui, models);
      Vitest.expect(label).toBe('a/m');
    }),
  );

  Vitest.it.effect('searches live when provided', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({
        selects: [Interactive.PICK_ANOTHER],
        searches: ['b/n'],
      });
      const label = yield* Interactive.pickModel(ui, models);
      Vitest.expect(label).toBe('b/n');
    }),
  );

  Vitest.it.effect('falls back to input filter without a search dialog', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({
        selects: [Interactive.PICK_ANOTHER, 'b/n'],
        inputs: ['/n'],
      });
      const label = yield* Interactive.pickModel(ui, models);
      Vitest.expect(label).toBe('b/n');
    }),
  );
});

Vitest.describe('Interactive.resolveModelOptions', () => {
  Vitest.it('prefers scoped models over the catalogue', () => {
    Vitest.expect(
      Interactive.resolveModelOptions({
        model: { provider: 'a', id: 'm' },
        scopedModels: [{ model: { provider: 'b', id: 'n' } }],
        modelRegistry: { getAvailable: () => [{ provider: 'c', id: 'o' }] },
      }),
    ).toStrictEqual([
      { label: 'a/m', current: true },
      { label: 'b/n', current: false },
    ]);
  });

  Vitest.it('falls back to the catalogue when nothing is scoped', () => {
    Vitest.expect(
      Interactive.resolveModelOptions({
        model: undefined,
        scopedModels: [],
        modelRegistry: { getAvailable: () => [{ provider: 'c', id: 'o' }] },
      }),
    ).toStrictEqual([{ label: 'c/o', current: false }]);
  });
});
