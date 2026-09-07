import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import * as ModelPicker from '../index.js';

const options: ReadonlyArray<ModelPicker.ModelOption> = [
  { label: 'b/n', current: false },
  { label: 'a/m', current: true },
  { label: 'c/o', current: false },
];

Vitest.describe('ModelPicker.displayModel', () => {
  Vitest.it.effect('marks the current model briefly', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* ModelPicker.displayModel({ label: 'a/m', current: true })).toBe(
        'a/m (current)',
      );
    }),
  );

  Vitest.it.effect('leaves other models plain', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* ModelPicker.displayModel({ label: 'b/n', current: false })).toBe('b/n');
    }),
  );
});

Vitest.describe('ModelPicker.currentOption', () => {
  Vitest.it.effect('finds the marked current model', () =>
    Effect.gen(function* () {
      Vitest.expect((yield* ModelPicker.currentOption(options))?.label).toBe('a/m');
    }),
  );

  Vitest.it.effect('returns undefined when none is marked', () =>
    Effect.gen(function* () {
      Vitest.expect(
        yield* ModelPicker.currentOption([{ label: 'b/n', current: false }]),
      ).toBeUndefined();
    }),
  );
});

Vitest.describe('ModelPicker.pickerItems', () => {
  Vitest.it.effect('pins the current model first with display labels', () =>
    Effect.gen(function* () {
      Vitest.expect(yield* ModelPicker.pickerItems(options)).toStrictEqual([
        { value: 'a/m', label: 'a/m (current)' },
        { value: 'b/n', label: 'b/n' },
        { value: 'c/o', label: 'c/o' },
      ]);
    }),
  );

  Vitest.it.effect('keeps caller order when no current is marked', () =>
    Effect.gen(function* () {
      const plain: ReadonlyArray<ModelPicker.ModelOption> = [
        { label: 'b/n', current: false },
        { label: 'c/o', current: false },
      ];
      Vitest.expect(yield* ModelPicker.pickerItems(plain)).toStrictEqual([
        { value: 'b/n', label: 'b/n' },
        { value: 'c/o', label: 'c/o' },
      ]);
    }),
  );
});

Vitest.describe('ModelPicker.modelPickerDialog', () => {
  Vitest.it.effect('resolves undefined immediately when empty', () =>
    Effect.gen(function* () {
      // SAFETY: the stub never runs — an empty list resolves before `custom`
      // is called, so `undefined` is never observed as `T` in this test.
      const ui: ModelPicker.ModelPickerUi = {
        custom: <T>() => Promise.resolve(undefined as T),
      };
      Vitest.expect(yield* ModelPicker.modelPickerDialog(ui, [])).toBeUndefined();
    }),
  );
});
