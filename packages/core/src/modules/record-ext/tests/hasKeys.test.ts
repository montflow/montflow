import * as Vitest from '@effect/vitest';

import * as RecordExt from '../index.js';

Vitest.describe('RecordExt.hasKeys types', () => {
  Vitest.it('narrows a possibly-undefined property to its defined type', () => {
    const thing: { value: number | undefined } = { value: 1 };
    if (RecordExt.hasKeys(thing, ['value'])) {
      Vitest.expectTypeOf(thing.value).toEqualTypeOf<number>();
    }
  });

  Vitest.it('narrows optional properties to their defined type', () => {
    const thing: { value?: number } = { value: 1 };
    if (RecordExt.hasKeys(thing, ['value'])) {
      Vitest.expectTypeOf(thing.value).toEqualTypeOf<number>();
    }
  });
});

Vitest.describe('RecordExt.hasKeys runtime', () => {
  Vitest.it('returns true when every key is present with a defined value', () => {
    Vitest.expect(RecordExt.hasKeys({ min: 0, max: 1 }, ['min', 'max'])).toBe(true);
  });

  Vitest.it('returns true for an empty key list', () => {
    Vitest.expect(RecordExt.hasKeys({}, [])).toBe(true);
  });

  Vitest.it('returns false when a key is absent', () => {
    Vitest.expect(RecordExt.hasKeys({ min: 0 }, ['min', 'max'])).toBe(false);
  });

  Vitest.it('returns false when a key is present but undefined', () => {
    Vitest.expect(RecordExt.hasKeys({ min: 0, max: undefined }, ['min', 'max'])).toBe(false);
  });

  Vitest.it('supports the data-last form', () => {
    Vitest.expect(RecordExt.hasKeys(['min', 'max'])({ min: 0, max: 1 })).toBe(true);
    Vitest.expect(RecordExt.hasKeys(['min', 'max'])({ min: 0 })).toBe(false);
  });
});
