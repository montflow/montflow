import * as Vitest from '@effect/vitest';
import { Effect, Schema } from 'effect';
import { Receipt, Run, RunEvent } from '../../index.js';
import { Verify } from '../index.js';

/** Raw `run.md` for the given status. */
const runMd = (status: Run.Status, id = 'run-1'): string => {
  const run = Schema.decodeUnknownSync(Run.Run)({
    id,
    parent: null,
    status,
    created: '2026-09-05T00:00:00Z',
    updated: '2026-09-05T00:00:01Z',
    sessionFile: `.agents/@montflow/pi-runs/runs/${id}/session.jsonl`,
  });
  return `---\n${JSON.stringify(Run.encode(run))}\n---\n# run ${id}\n`;
};

/** Raw `session.jsonl` from events. */
const session = (events: ReadonlyArray<RunEvent.Event>): string =>
  `${events.map((event) => JSON.stringify(RunEvent.encode(event))).join('\n')}\n`;

/** Raw `receipt.md` for the given outcome and run id. */
const receiptMd = (outcome: Receipt.Outcome, runId = 'run-1'): string => {
  const receipt = Schema.decodeUnknownSync(Receipt.Receipt)({
    runId,
    outcome,
    summary: 'done',
    endedAt: '2026-09-05T00:00:02Z',
  });
  return `---\n${JSON.stringify(Receipt.encode(receipt))}\n---\n# receipt ${runId}\n`;
};

const event = (
  seq: number,
  role: RunEvent.Role,
  text = 'hi',
  message?: RunEvent.Event['message'],
): RunEvent.Event => {
  const input: RunEvent.EventInput = { seq, role, text, at: '2026-09-05T00:00:01Z' };
  if (message !== undefined) input.message = message;
  return new RunEvent.Event(input);
};

Vitest.describe('Verify runtime', () => {
  Vitest.it.effect('accepts a running run with a replayable transcript', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(true);
      Vitest.expect(result.issues).toStrictEqual([]);
    }),
  );

  Vitest.it.effect('accepts a terminal run with a matching receipt but refuses resume', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: receiptMd('done'),
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(false);
    }),
  );

  Vitest.it.effect('flags a terminal run with no receipt', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('failed'),
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt');
    }),
  );

  Vitest.it.effect('flags a non-monotonic seq', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: session([event(1, 'user'), event(3, 'assistant')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session.seq');
    }),
  );

  Vitest.it.effect('refuses resume for an assistant turn with no raw message', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: session([event(1, 'user'), event(2, 'assistant', 'text only')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(false);
    }),
  );

  Vitest.it.effect('flags an id mismatch', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-2',
        runMd: runMd('running', 'run-1'),
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('run.id');
    }),
  );

  Vitest.it.effect('flags a raw message that is not a Pi message', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: session([event(1, 'user'), event(2, 'assistant', 'text', null)]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.resumable).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session.message');
    }),
  );

  Vitest.it.effect('flags a receipt whose runId does not match the directory', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: receiptMd('done', 'run-2'),
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt.runId');
    }),
  );

  Vitest.it.effect('flags a receipt outcome that mismatches the terminal status', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: receiptMd('failed'),
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt.outcome');
    }),
  );

  Vitest.it.effect('flags a receipt present on a non-terminal run', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: session([event(1, 'user')]),
        receipt: receiptMd('done'),
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('status');
    }),
  );

  Vitest.it.effect('flags a run.md without a frontmatter block', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: '# run-1\n',
        session: session([event(1, 'user')]),
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('run.md');
    }),
  );

  Vitest.it.effect('flags a malformed receipt frontmatter', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('done'),
        session: session([event(1, 'user'), event(2, 'assistant', 'done')]),
        receipt: '# receipt without frontmatter\n',
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('receipt.md');
    }),
  );

  Vitest.it.effect('flags a malformed session line', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: '{"seq":1,"role":"user","text":"hi","at":"x"}\nnot json\n',
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(false);
      Vitest.expect(result.issues.map((issue) => issue.field)).toContain('session');
    }),
  );

  Vitest.it.effect('ignores blank lines in the transcript', () =>
    Effect.sync(() => {
      const result = Verify.verifyRun({
        id: 'run-1',
        runMd: runMd('running'),
        session: `\n${JSON.stringify(RunEvent.encode(event(1, 'user')))}\n\n`,
        receipt: undefined,
      });
      Vitest.expect(result.valid).toBe(true);
      Vitest.expect(result.resumable).toBe(true);
    }),
  );
});
