import * as Vitest from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { Receipt, Session, SessionEvent } from '../../index.js';
import { Verify } from '../index.js';

/** Raw `session.md` for the given status. */
const sessionMd = (status: Session.Status, id = 'session-1'): string => {
  const session = Schema.decodeUnknownSync(Session.Session)({
    id,
    parent: null,
    status,
    created: '2026-09-05T00:00:00Z',
    updated: '2026-09-05T00:00:01Z',
    sessionFile: `.agents/@montflow/sessions/${id}/session.jsonl`,
  });
  return `---\n${JSON.stringify(Session.encode(session))}\n---\n# session ${id}\n`;
};

/** Raw `session.jsonl` from events. */
const session = (events: ReadonlyArray<SessionEvent.Event>): string =>
  `${events.map((event) => JSON.stringify(SessionEvent.encode(event))).join('\n')}\n`;

/** Raw `receipt.md` for the given outcome and session id. */
const receiptMd = (outcome: Receipt.Outcome, sessionId = 'session-1'): string => {
  const receipt = Schema.decodeUnknownSync(Receipt.Receipt)({
    sessionId,
    outcome,
    summary: 'done',
    endedAt: '2026-09-05T00:00:02Z',
  });
  return `---\n${JSON.stringify(Receipt.encode(receipt))}\n---\n# receipt ${sessionId}\n`;
};

const event = (
  seq: number,
  role: SessionEvent.Role,
  text = 'hi',
  message?: SessionEvent.Event['message'],
): SessionEvent.Event => {
  const input: SessionEvent.EventInput = { seq, role, text, at: '2026-09-05T00:00:01Z' };
  if (message !== undefined) input.message = message;
  return new SessionEvent.Event(input);
};

Vitest.describe('Verify runtime', () => {
  Vitest.it.effect('accepts a running session with a replayable transcript', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(true);
      Vitest.expect(result.issues).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('accepts a terminal session with a matching receipt but refuses resume', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: receiptMd('done'),
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(false);
    }),
  );

  Vitest.it.effect('flags a terminal session with no receipt', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('failed'),
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt');
    }),
  );

  Vitest.it.effect('flags a non-monotonic seq', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: session([event(1, 'user'), event(3, 'assistant')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session.seq');
    }),
  );

  Vitest.it.effect('refuses resume for an assistant turn with no raw message', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: session([event(1, 'user'), event(2, 'assistant', 'text only')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(false);
    }),
  );

  Vitest.it.effect('flags an id mismatch', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-2',
        sessionMd: sessionMd('running', 'session-1'),
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session.id');
    }),
  );

  Vitest.it.effect('flags a raw message that is not a Pi message', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: session([event(1, 'user'), event(2, 'assistant', 'text', null)]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.resumable).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session.message');
    }),
  );

  Vitest.it.effect('flags a receipt whose sessionId does not match the directory', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: receiptMd('done', 'session-2'),
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt.sessionId');
    }),
  );

  Vitest.it.effect('flags a receipt outcome that mismatches the terminal status', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: receiptMd('failed'),
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt.outcome');
    }),
  );

  Vitest.it.effect('flags a receipt present on a non-terminal session', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: session([event(1, 'user')]),
        receipt: receiptMd('done'),
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('status');
    }),
  );

  Vitest.it.effect('flags a session.md without a frontmatter block', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: '# session-1\n',
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session.md');
    }),
  );

  Vitest.it.effect('flags a malformed receipt frontmatter', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: '# receipt without frontmatter\n',
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt.md');
    }),
  );

  Vitest.it.effect('flags a malformed session line', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: '{"seq":1,"role":"user","text":"hi","at":"x"}\nnot json\n',
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session');
    }),
  );

  Vitest.it.effect('ignores blank lines in the transcript', () =>
    Effect.sync(() => {
      const result = Verify.verifySession({
        id: 'session-1',
        sessionMd: sessionMd('running'),
        session: `\n${JSON.stringify(SessionEvent.encode(event(1, 'user')))}\n\n`,
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(true);
    }),
  );
});

Vitest.describe('Verify store ignore', () => {
  const sessionsPath = '.agents/@montflow/sessions';

  Vitest.it.effect('accepts an active ignore rule', () =>
    Effect.sync(() => {
      const result = Verify.verifyStoreIgnored(`# sessions\n${sessionsPath}\n`, sessionsPath);
      Vitest.expect(result.ignored).toBe(true);
      Vitest.expect(result.issues).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('accepts a trailing-slash or glob rule', () =>
    Effect.sync(() => {
      Vitest.expect(Verify.verifyStoreIgnored(`${sessionsPath}/\n`, sessionsPath).ignored).toBe(
        true,
      );
      Vitest.expect(Verify.verifyStoreIgnored(`${sessionsPath}/**\n`, sessionsPath).ignored).toBe(
        true,
      );
    }),
  );

  Vitest.it.effect('rejects a commented-out or missing rule', () =>
    Effect.sync(() => {
      const commented = Verify.verifyStoreIgnored(`# ${sessionsPath}\n`, sessionsPath);
      Vitest.expect(commented.ignored).toBe(false);
      Vitest.expect(commented.issues.map((entry) => entry.field)).toContain('.gitignore');
      Vitest.expect(Verify.verifyStoreIgnored('', sessionsPath).ignored).toBe(false);
    }),
  );

  Vitest.it.effect('last matching rule wins, so a negation un-ignores', () =>
    Effect.sync(() => {
      const result = Verify.verifyStoreIgnored(`${sessionsPath}\n!${sessionsPath}\n`, sessionsPath);
      Vitest.expect(result.ignored).toBe(false);
    }),
  );
});
