import { join } from 'node:path';
import { Session, Store } from '@montflow/pi-sessions';
import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { isValidSessionId, sessionsDir } from '../sessions.services.module.js';

describe('sessionsDir', () => {
  it('mirrors the extension store segments so the paths cannot drift', () => {
    expect(sessionsDir('/repo')).toBe(join('/repo', ...Store.SESSIONS_SEGMENTS));
  });
});

describe('isValidSessionId', () => {
  it('agrees with the pi-sessions Session.Id schema', () => {
    const decodes = Schema.is(Session.Id);
    const samples = ['session-1', '', '../escape', 'BAD ID!', 'a'.repeat(65), 'a'.repeat(64)];
    for (const id of samples) expect(isValidSessionId(id)).toBe(decodes(id));
  });
});
