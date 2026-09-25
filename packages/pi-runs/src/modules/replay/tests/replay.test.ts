import * as Vitest from '@effect/vitest';
import { Effect } from 'effect';
import { RunEvent } from '../../run-event/index.js';
import { Replay } from '../index.js';

/** Build a stored event with sensible defaults. */
const event = (overrides: Partial<RunEvent.Event>): RunEvent.Event =>
  new RunEvent.Event({
    seq: 1,
    role: 'user',
    text: 'hello',
    at: '2026-09-05T00:00:01Z',
    ...overrides,
  });

Vitest.describe('Replay runtime', () => {
  Vitest.it.effect('replays user turns synthesized from text', () =>
    Effect.sync(() => {
      const events = [event({})];
      Vitest.expect(Replay.canReplay(events)).toBe(true);
      Vitest.expect(Replay.toMessages(events)).toStrictEqual([
        { role: 'user', content: 'hello', timestamp: Date.parse('2026-09-05T00:00:01Z') },
      ]);
    }),
  );

  Vitest.it.effect('prefers the raw message when present', () =>
    Effect.sync(() => {
      const raw = { role: 'assistant', content: [{ type: 'text', text: 'hi' }] };
      const events = [event({ role: 'assistant', message: raw })];
      Vitest.expect(Replay.canReplay(events)).toBe(true);
      Vitest.expect(Replay.toMessages(events)).toStrictEqual([raw]);
    }),
  );

  Vitest.it.effect('rejects raw values that are not Pi messages', () =>
    Effect.sync(() => {
      const invalid: ReadonlyArray<unknown> = [
        null,
        'assistant',
        [],
        {},
        { role: 'system', content: 'pointer' },
        { role: 'assistant' },
      ];
      for (const message of invalid) {
        const events = [event({ role: 'assistant', message })];
        Vitest.expect(Replay.canReplay(events)).toBe(false);
        Vitest.expect(Replay.toMessages(events)).toStrictEqual([]);
      }
    }),
  );

  Vitest.it.effect('refuses assistant turns without a raw message', () =>
    Effect.sync(() => {
      Vitest.expect(Replay.canReplay([event({ role: 'assistant' })])).toBe(false);
      Vitest.expect(Replay.canReplay([event({ role: 'toolResult' })])).toBe(false);
    }),
  );

  Vitest.it.effect('skips system pointers', () =>
    Effect.sync(() => {
      const events = [event({}), event({ seq: 2, role: 'system', text: 'subrun started' })];
      Vitest.expect(Replay.canReplay(events)).toBe(true);
      Vitest.expect(Replay.toMessages(events)).toHaveLength(1);
    }),
  );

  Vitest.it.effect('falls back to epoch zero for unparseable timestamps', () =>
    Effect.sync(() => {
      const [message] = Replay.toMessages([event({ at: 'not-a-date' })]);
      Vitest.expect(message).toStrictEqual({ role: 'user', content: 'hello', timestamp: 0 });
    }),
  );
});
