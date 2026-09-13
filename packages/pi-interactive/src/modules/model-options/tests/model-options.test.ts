import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type * as Dialogs from '../../dialogs/index.js';
import * as ModelOptions from '../index.js';

const scriptedUi = (answers: {
  readonly selects?: ReadonlyArray<string | undefined>;
  readonly inputs?: ReadonlyArray<string | undefined>;
  readonly searches?: ReadonlyArray<string | undefined>;
}): Dialogs.InteractiveUi => {
  let si = 0;
  let ii = 0;
  let gi = 0;
  const base: Dialogs.InteractiveUi = {
    select: () => Promise.resolve(answers.selects?.[si++]),
    confirm: () => Promise.resolve(false),
    input: () => Promise.resolve(answers.inputs?.[ii++]),
    notify: () => {},
  };
  if (answers.searches === undefined) return base;
  return { ...base, searchSelect: () => Promise.resolve(answers.searches?.[gi++]) };
};

const models: ReadonlyArray<Dialogs.ModelOption> = [
  { label: 'a/m', current: true },
  { label: 'b/n', current: false },
];

Vitest.describe('ModelOptions.matchesFilter', () => {
  Vitest.it('matches subsequences case-insensitively', () => {
    Vitest.expect(ModelOptions.matchesFilter('anthropic/claude-sonnet-4-5', 'snt')).toBe(true);
    Vitest.expect(ModelOptions.matchesFilter('anthropic/claude-sonnet-4-5', 'SONNET')).toBe(true);
  });

  Vitest.it('rejects out-of-order characters and blank-armors empty queries', () => {
    Vitest.expect(ModelOptions.matchesFilter('anthropic/claude', 'eht')).toBe(false);
    Vitest.expect(ModelOptions.matchesFilter('anthropic/claude', '')).toBe(true);
    Vitest.expect(ModelOptions.matchesFilter('anthropic/claude', '   ')).toBe(true);
  });
});

Vitest.describe('ModelOptions.modelOptions', () => {
  Vitest.it('puts the current model first without duplicates', () => {
    Vitest.expect(
      ModelOptions.modelOptions({ provider: 'a', id: 'm' }, [
        { provider: 'a', id: 'm' },
        { provider: 'b', id: 'n' },
      ]),
    ).toStrictEqual([
      { label: 'a/m', current: true },
      { label: 'b/n', current: false },
    ]);
  });
});

Vitest.describe('ModelOptions.pickModel', () => {
  Vitest.it.effect('returns the menu pick directly', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({ selects: ['a/m (current)'] });
      const label = yield* ModelOptions.pickModel(ui, models);
      Vitest.expect(label).toBe('a/m');
    }),
  );

  Vitest.it.effect('searches live when provided', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({
        selects: [ModelOptions.PICK_ANOTHER],
        searches: ['b/n'],
      });
      const label = yield* ModelOptions.pickModel(ui, models);
      Vitest.expect(label).toBe('b/n');
    }),
  );

  Vitest.it.effect('falls back to input filter without a search dialog', () =>
    Effect.gen(function* () {
      const ui = scriptedUi({
        selects: [ModelOptions.PICK_ANOTHER, 'b/n'],
        inputs: ['/n'],
      });
      const label = yield* ModelOptions.pickModel(ui, models);
      Vitest.expect(label).toBe('b/n');
    }),
  );
});

Vitest.describe('ModelOptions.resolveModelOptions', () => {
  Vitest.it('prefers scoped models over the catalogue', () => {
    Vitest.expect(
      ModelOptions.resolveModelOptions({
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
      ModelOptions.resolveModelOptions({
        model: undefined,
        scopedModels: [],
        modelRegistry: { getAvailable: () => [{ provider: 'c', id: 'o' }] },
      }),
    ).toStrictEqual([{ label: 'c/o', current: false }]);
  });
});
