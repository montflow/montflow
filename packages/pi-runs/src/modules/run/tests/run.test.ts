import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { Run } from '../index.js';

const valid = {
  id: 'run-1',
  parent: null,
  status: 'pending',
  created: '2026-09-05T00:00:00Z',
  updated: '2026-09-05T00:00:00Z',
  sessionFile: '.agents/@montflow/runs/run-1/session.jsonl',
};

Vitest.describe('Run.Run runtime', () => {
  Vitest.it.effect('constructs from decoded values', () =>
    Effect.gen(function* () {
      const decoded = yield* Run.decodeUnknown(valid);
      const remade = new Run.Run({
        id: decoded.id,
        parent: decoded.parent,
        status: decoded.status,
        created: decoded.created,
        updated: decoded.updated,
        sessionFile: decoded.sessionFile,
      });
      Vitest.expect(remade.id).toBe('run-1');
      Vitest.expect(remade.status).toBe('pending');
    }),
  );

  Vitest.it('throws on invalid id', () => {
    // SAFETY: intentionally invalid fixture — proves the constructor throws; never persisted.
    const badId = 'BAD ID!' as Run.Id;
    Vitest.expect(
      () =>
        new Run.Run({
          ...valid,
          status: 'pending',
          id: badId,
        }),
    ).toThrow();
  });
});

Vitest.describe('Run.newId runtime', () => {
  Vitest.it('slugs a display name into a directory-safe id', () => {
    Vitest.expect(Run.slugifyName('Create profile: a reviewer', 1000)).toBe(
      'create-profile-a-reviewer-rs',
    );
  });

  Vitest.it('falls back to `run` when the name slugs to nothing', () => {
    Vitest.expect(Run.slugifyName('***', 1000)).toBe('run-rs');
  });

  Vitest.it.effect('reads the clock for the suffix', () =>
    Effect.gen(function* () {
      const id = yield* Run.newId('Modify skill');
      Vitest.expect(id.startsWith('modify-skill-')).toBe(true);
      Vitest.expect(Run.isValidId(id)).toBe(true);
    }),
  );

  Vitest.it('refuses traversal and blank ids', () => {
    Vitest.expect(Run.isValidId('run-1')).toBe(true);
    Vitest.expect(Run.isValidId('../run')).toBe(false);
    Vitest.expect(Run.isValidId('')).toBe(false);
    Vitest.expect(Run.isValidId('Run-1')).toBe(false);
  });
});
