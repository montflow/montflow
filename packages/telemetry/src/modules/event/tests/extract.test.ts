import * as Vitest from '@effect/vitest';
import { createHash } from 'node:crypto';
import * as Event from '../index.js';

const NOW = 1_793_188_800_000;
const CREATED = 1_793_178_000_000;
const SESSION = 'ses_fixture';

const base = { captureDeltas: false, captureBodies: false };

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

Vitest.describe('Event.extract runtime', () => {
  Vitest.it('normalizes an allowlisted event to the stable line shape', () => {
    const line = Event.extract(
      {
        type: 'session.step.started',
        created: CREATED,
        data: {
          sessionID: SESSION,
          assistantMessageID: 'msg_1',
          agent: 'build',
          model: { providerID: 'anthropic', id: 'claude-sonnet-4' },
          started: CREATED,
        },
      },
      base,
      NOW,
    );
    Vitest.expect(line).toStrictEqual({
      v: 1,
      ts: CREATED,
      type: 'session.step.started',
      sessionID: SESSION,
      agent: 'build',
      model: { providerID: 'anthropic', id: 'claude-sonnet-4' },
      payload: {
        sessionID: SESSION,
        assistantMessageID: 'msg_1',
        agent: 'build',
        model: { providerID: 'anthropic', id: 'claude-sonnet-4' },
        started: CREATED,
      },
    });
  });

  Vitest.it('skips types outside the allowlist', () => {
    Vitest.expect(
      Event.extract(
        { type: 'filesystem.changed', created: CREATED, data: { sessionID: SESSION } },
        base,
        NOW,
      ),
    ).toBeUndefined();
  });

  Vitest.it('skips deltas unless captureDeltas is on', () => {
    const delta = {
      type: 'session.text.delta',
      created: CREATED,
      data: { sessionID: SESSION, assistantMessageID: 'msg_1', ordinal: 1, delta: 'hello' },
    };
    Vitest.expect(Event.extract(delta, base, NOW)).toBeUndefined();
    Vitest.expect(Event.extract(delta, { ...base, captureDeltas: true }, NOW)?.type).toBe(
      'session.text.delta',
    );
  });

  Vitest.it('hashes message bodies by default', () => {
    const text = 'compact this conversation';
    const line = Event.extract(
      {
        type: 'session.compaction.ended',
        created: CREATED,
        data: { sessionID: SESSION, reason: 'auto', text, recent: 'tail' },
      },
      base,
      NOW,
    );
    Vitest.expect(line?.payload['text']).toStrictEqual({
      redacted: true,
      sha256: sha256(text),
      bytes: Buffer.byteLength(text, 'utf8'),
    });
    Vitest.expect(line?.payload['recent']).toStrictEqual({
      redacted: true,
      sha256: sha256('tail'),
      bytes: 4,
    });
  });

  Vitest.it('keeps raw bodies when captureBodies is on', () => {
    const line = Event.extract(
      {
        type: 'session.compaction.ended',
        created: CREATED,
        data: { sessionID: SESSION, reason: 'auto', text: 'raw body', recent: 'tail' },
      },
      { ...base, captureBodies: true },
      NOW,
    );
    Vitest.expect(line?.payload['text']).toBe('raw body');
    Vitest.expect(line?.payload['recent']).toBe('tail');
  });

  Vitest.it('keeps cost and token counts untouched', () => {
    const tokens = { input: 120, output: 30, reasoning: 0, cache: { read: 0, write: 0 } };
    const line = Event.extract(
      {
        type: 'session.step.ended',
        created: CREATED,
        data: {
          sessionID: SESSION,
          assistantMessageID: 'msg_1',
          finish: 'stop',
          cost: 0.0042,
          tokens,
        },
      },
      base,
      NOW,
    );
    Vitest.expect(line?.payload['cost']).toBe(0.0042);
    Vitest.expect(line?.payload['tokens']).toStrictEqual(tokens);
  });

  Vitest.it('skips an event with no usable session id', () => {
    Vitest.expect(
      Event.extract({ type: 'session.idle', created: CREATED, data: { sessionID: 42 } }, base, NOW),
    ).toBeUndefined();
    Vitest.expect(
      Event.extract({ type: 'session.idle', created: CREATED, data: {} }, base, NOW),
    ).toBeUndefined();
  });

  Vitest.it('falls back to the injected clock when the event has no created time', () => {
    const line = Event.extract({ type: 'session.idle', data: { sessionID: SESSION } }, base, NOW);
    Vitest.expect(line?.ts).toBe(NOW);
  });
});
