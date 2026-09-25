import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { RunEvent } from '../index.js';

const valid = {
  seq: 1,
  role: 'user',
  text: 'hello',
  at: '2026-09-05T00:00:01Z',
};

Vitest.describe('RunEvent.decodeUnknown runtime', () => {
  Vitest.it.effect('decodes a chat turn', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown(valid);
      Vitest.expect(event.seq).toBe(1);
      Vitest.expect(event.role).toBe('user');
    }),
  );

  Vitest.it.effect('decodes a subrun pointer', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown({
        ...valid,
        seq: 2,
        role: 'system',
        text: 'subrun started',
        subrunId: 'run-1-scout',
      });
      Vitest.expect(event.subrunId).toBe('run-1-scout');
    }),
  );

  Vitest.it.effect('rejects seq zero', () =>
    Effect.gen(function* () {
      const error = yield* RunEvent.decodeUnknown({ ...valid, seq: 0 }).pipe(Effect.flip);
      Vitest.expect(error).toBeDefined();
    }),
  );

  Vitest.it.effect('round-trips through encode', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown(valid);
      Vitest.expect(RunEvent.encode(event)).toStrictEqual(valid);
    }),
  );

  Vitest.it.effect('decodes a tool result carrying a raw message', () =>
    Effect.gen(function* () {
      const raw = {
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'read',
        content: [{ type: 'text', text: 'file body' }],
        isError: false,
        timestamp: 1,
      };
      const event = yield* RunEvent.decodeUnknown({
        ...valid,
        seq: 3,
        role: 'toolResult',
        text: '',
        message: raw,
      });
      Vitest.expect(event.role).toBe('toolResult');
      Vitest.expect(event.message).toStrictEqual(raw);
    }),
  );

  Vitest.it.effect('allows empty display text when a raw message is present', () =>
    Effect.gen(function* () {
      const event = yield* RunEvent.decodeUnknown({
        ...valid,
        text: '',
        message: { role: 'assistant', content: [] },
      });
      Vitest.expect(event.text).toBe('');
    }),
  );
});
