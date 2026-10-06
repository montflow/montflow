import * as Vitest from '@effect/vitest';
import { Profiles } from '../../index.js';

const snapshot = (ids: ReadonlyArray<string>) => ({
  installed: true,
  rows: ids.map((id) => ({
    id,
    name: id,
    description: '',
    model: '',
    skills: [],
    instructions: '',
    checklist: [],
  })),
});

Vitest.describe('Profiles.applyProfileChange', () => {
  Vitest.it('inserts a created profile and keeps the list sorted by name', () => {
    const next = Profiles.applyProfileChange(snapshot(['ada']), {
      kind: 'created',
      id: 'grace',
      value: snapshot(['grace']).rows[0],
    });
    Vitest.expect(next?.rows.map((row) => row.id)).toEqual(['ada', 'grace']);
  });

  Vitest.it('replaces an updated profile in place', () => {
    const next = Profiles.applyProfileChange(snapshot(['ada', 'grace']), {
      kind: 'updated',
      id: 'ada',
      value: { ...snapshot(['ada']).rows[0]!, description: 'updated' },
    });
    Vitest.expect(next?.rows.map((row) => row.id)).toEqual(['ada', 'grace']);
    Vitest.expect(next?.rows[0]?.description).toBe('updated');
  });

  Vitest.it('drops a removed profile', () => {
    const next = Profiles.applyProfileChange(snapshot(['ada', 'grace']), {
      kind: 'removed',
      id: 'ada',
    });
    Vitest.expect(next?.rows.map((row) => row.id)).toEqual(['grace']);
  });

  Vitest.it('leaves the list unchanged when the change carries no value', () => {
    const previous = snapshot(['ada']);
    Vitest.expect(Profiles.applyProfileChange(previous, { kind: 'updated', id: 'ada' })).toBe(
      previous,
    );
  });

  Vitest.it('returns undefined before the first load', () => {
    Vitest.expect(Profiles.applyProfileChange(undefined, { kind: 'created', id: 'ada' })).toBe(
      undefined,
    );
  });
});
