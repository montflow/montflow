import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { Session } from '../index.js';

const valid = {
  id: 'session-1',
  parent: null,
  status: 'pending',
  created: '2026-09-05T00:00:00Z',
  updated: '2026-09-05T00:00:00Z',
  sessionFile: '.agents/@montflow/sessions/session-1/session.jsonl',
};

Vitest.describe('Session.Session runtime', () => {
  Vitest.it.effect('constructs from decoded values', () =>
    Effect.gen(function* () {
      const decoded = yield* Session.decodeUnknown(valid);
      const remade = new Session.Session({
        id: decoded.id,
        parent: decoded.parent,
        status: decoded.status,
        created: decoded.created,
        updated: decoded.updated,
        sessionFile: decoded.sessionFile,
      });
      Vitest.expect(remade.id).toBe('session-1');
      Vitest.expect(remade.status).toBe('pending');
    }),
  );

  Vitest.it('throws on invalid id', () => {
    // SAFETY: intentionally invalid fixture — proves the constructor throws; never persisted.
    const badId = 'BAD ID!' as Session.Id;
    Vitest.expect(
      () =>
        new Session.Session({
          ...valid,
          status: 'pending',
          id: badId,
        }),
    ).toThrow();
  });
});

Vitest.describe('Session.newId runtime', () => {
  Vitest.it('slugs a display name into a directory-safe id', () => {
    Vitest.expect(Session.slugifyName('Create profile: a reviewer', 1000)).toBe(
      'create-profile-a-reviewer-rs',
    );
  });

  Vitest.it('falls back to `session` when the name slugs to nothing', () => {
    Vitest.expect(Session.slugifyName('***', 1000)).toBe('session-rs');
  });

  Vitest.it.effect('reads the clock for the suffix', () =>
    Effect.gen(function* () {
      const id = yield* Session.newId('Modify skill');
      Vitest.expect(id.startsWith('modify-skill-')).toBe(true);
      Vitest.expect(Session.isValidId(id)).toBe(true);
    }),
  );

  Vitest.it('refuses traversal and blank ids', () => {
    Vitest.expect(Session.isValidId('session-1')).toBe(true);
    Vitest.expect(Session.isValidId('../session')).toBe(false);
    Vitest.expect(Session.isValidId('')).toBe(false);
    Vitest.expect(Session.isValidId('Session-1')).toBe(false);
  });
});
