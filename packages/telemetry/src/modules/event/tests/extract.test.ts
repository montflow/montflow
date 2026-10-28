import * as Vitest from '@effect/vitest';
import { createHash } from 'node:crypto';
import * as Event from '../index.js';

const NOW = 1_793_188_800_000;
const CREATED = 1_793_178_000_000;
const SESSION = 'ses_fixture';

const base = { captureDeltas: false, captureBodies: false };

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

const lineOf = (
  input: Event.IncomingInput,
  settings: Event.Capture = base,
  now = NOW,
  hash = sha256,
): Event.Line | undefined => Event.extract(input, settings, now, hash);

Vitest.describe('Event.extract runtime', () => {
  Vitest.it('normalizes an allowlisted event to the stable line shape', () => {
    const line = lineOf(
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
      lineOf(
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
    Vitest.expect(lineOf(delta, base, NOW)).toBeUndefined();
    Vitest.expect(lineOf(delta, { ...base, captureDeltas: true }, NOW)?.type).toBe(
      'session.text.delta',
    );
  });

  Vitest.it('hashes message bodies by default', () => {
    const text = 'compact this conversation';
    const line = lineOf(
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
    const line = lineOf(
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
    const line = lineOf(
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
      lineOf({ type: 'session.idle', created: CREATED, data: { sessionID: 42 } }, base, NOW),
    ).toBeUndefined();
    Vitest.expect(
      lineOf({ type: 'session.idle', created: CREATED, data: {} }, base, NOW),
    ).toBeUndefined();
  });

  Vitest.it('falls back to the injected clock when the event has no created time', () => {
    const line = lineOf({ type: 'session.idle', data: { sessionID: SESSION } }, base, NOW);
    Vitest.expect(line?.ts).toBe(NOW);
  });

  Vitest.it('falls back to now for an out-of-range created timestamp', () => {
    const line = lineOf(
      { type: 'session.idle', created: 1e308, data: { sessionID: SESSION } },
      base,
      NOW,
    );
    Vitest.expect(line?.ts).toBe(NOW);
  });

  Vitest.it('redacts prompt-derived session text but keeps the project slug', () => {
    const line = lineOf(
      {
        type: 'session.created',
        created: CREATED,
        data: {
          sessionID: SESSION,
          title: 'Debug the private customer export',
          slug: 'telemetry',
          metadata: { note: 'private' },
        },
      },
      base,
      NOW,
    );
    Vitest.expect(line?.payload['title']).toMatchObject({ redacted: true });
    Vitest.expect(line?.payload['metadata']).toMatchObject({ redacted: true });
    Vitest.expect(line?.payload['slug']).toBe('telemetry');
  });

  Vitest.it('keeps delta text readable when captureDeltas is on', () => {
    const line = lineOf(
      {
        type: 'session.text.delta',
        created: CREATED,
        data: { sessionID: SESSION, assistantMessageID: 'msg_1', ordinal: 0, delta: 'hello' },
      },
      { captureDeltas: true, captureBodies: false },
      NOW,
    );
    Vitest.expect(line?.payload['delta']).toBe('hello');
  });

  Vitest.it('uses the injected hash seam', () => {
    const line = lineOf(
      {
        type: 'session.compaction.ended',
        created: CREATED,
        data: { sessionID: SESSION, text: 'secret' },
      },
      base,
      NOW,
      (text) => `h:${text.length}`,
    );
    Vitest.expect(line?.payload['text']).toStrictEqual({
      redacted: true,
      sha256: 'h:6',
      bytes: 6,
    });
  });

  Vitest.it('redacts every mapped body field by default', () => {
    const cases = [
      [
        'session.tool.called',
        { sessionID: SESSION, id: 'call_1', input: { filePath: '/tmp/private' }, executed: true },
        'input',
      ],
      [
        'session.tool.success',
        { sessionID: SESSION, id: 'call_1', content: [{ type: 'text', text: 'private' }] },
        'content',
      ],
      [
        'session.inbox.enqueued',
        { sessionID: SESSION, inboxID: 'msg_1', item: { text: 'private prompt' } },
        'item',
      ],
      [
        'session.compaction.started',
        { sessionID: SESSION, reason: 'auto', recent: 'private tail' },
        'recent',
      ],
      [
        'session.tool.failed',
        {
          sessionID: SESSION,
          id: 'call_1',
          content: [{ type: 'text', text: 'private' }],
          executed: true,
        },
        'content',
      ],
      [
        'permission.asked',
        {
          id: 'perm_1',
          sessionID: SESSION,
          action: 'write',
          resources: ['/tmp/private'],
          message: 'Allow?',
          metadata: { detail: 'private' },
        },
        'message',
      ],
      [
        'permission.asked',
        {
          id: 'perm_1',
          sessionID: SESSION,
          action: 'write',
          resources: ['/tmp/private'],
          metadata: { detail: 'private' },
        },
        'metadata',
      ],
    ] as const;
    for (const [type, data, field] of cases) {
      const line = lineOf({ type, created: CREATED, data }, base, NOW);
      Vitest.expect(line?.payload[field]).toMatchObject({
        redacted: true,
        sha256: Vitest.expect.any(String),
      });
    }
  });
});
