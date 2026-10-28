import { describe, expect, it } from 'bun:test';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Option, Schema } from 'effect';
import * as Sqlite from '../../sqlite/index.js';
import * as Viewer from '../index.js';

const LiveBody = Schema.Struct({
  lines: Schema.Array(Schema.JsonObject),
  cursors: Schema.Record(Schema.String, Schema.Number),
});
const decodeLive = Schema.decodeUnknownOption(LiveBody);
const decodeRows = Schema.decodeUnknownOption(Schema.Array(Schema.JsonObject));
const rowsOf = <T>(value: T) => Option.getOrElse(decodeRows(value), () => []);
const liveOf = <T>(value: T) => {
  const decoded = Option.getOrUndefined(decodeLive(value));
  if (decoded === undefined) throw new Error('unexpected live body');
  return decoded;
};

const fixture = fileURLToPath(new URL('../../fold/tests/fixtures/session.ndjson', import.meta.url));

const withStore = async (run: (directory: string) => Promise<void>): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-viewer-'));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const seed = (directory: string): void => {
  copyFileSync(fixture, join(directory, '2026-10-28.ndjson'));
};

const get = (viewer: Viewer.Viewer, path: string, headers?: Record<string, string>) =>
  Bun.fetch(`${viewer.url.replace(/\/$/u, '')}${path}`, { headers });

const post = <T>(viewer: Viewer.Viewer, path: string, body: T): Promise<Response> =>
  Bun.fetch(`${viewer.url.replace(/\/$/u, '')}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('Viewer.start runtime', () => {
  it('serves the shell, empty state, and row budget', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60_000 });
      try {
        const html = await (await get(viewer, '/')).text();
        expect(html).toContain('No telemetry yet');
        expect(html).toContain(`MAX_WINDOW = ${Viewer.WINDOW_ROWS}`);
        expect(Viewer.WINDOW_ROWS).toBeLessThanOrEqual(120);
        expect(await (await get(viewer, '/api/sessions')).json()).toStrictEqual([]);
        expect(viewer.foldError).toBeNull();
      } finally {
        await viewer.stop();
      }
    });
  });

  it('serves folded history and incremental live lines', async () => {
    await withStore(async (directory) => {
      seed(directory);
      const viewer = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      try {
        expect(await (await get(viewer, '/api/sessions')).json()).toHaveLength(1);
        expect(await (await get(viewer, '/api/spans?session=ses_fixture')).json()).toHaveLength(12);

        const first = liveOf(await (await post(viewer, '/api/live', { cursors: {} })).json());
        expect(first.lines).toHaveLength(12);

        const second = liveOf(
          await (await post(viewer, '/api/live', { cursors: first.cursors })).json(),
        );
        expect(second.lines).toHaveLength(0);

        writeFileSync(
          join(directory, '2026-10-28.ndjson'),
          `${JSON.stringify({
            v: 1,
            ts: 1793178012000,
            type: 'session.idle',
            sessionID: 'ses_fixture',
            payload: { sessionID: 'ses_fixture' },
          })}\n`,
          { flag: 'a' },
        );
        const third = liveOf(
          await (await post(viewer, '/api/live', { cursors: second.cursors })).json(),
        );
        expect(third.lines).toHaveLength(1);
      } finally {
        await viewer.stop();
      }
    });
  });

  it('resumes live at the folded offset so no window is lost', async () => {
    await withStore(async (directory) => {
      const path = join(directory, '2026-10-28.ndjson');
      seed(directory);
      const size = (await Bun.file(path).stat()).size;
      const viewer = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      try {
        const folded = liveOf(await (await post(viewer, '/api/live', { fromFold: true })).json());
        expect(folded.lines).toHaveLength(0);
        expect(folded.cursors['2026-10-28.ndjson']).toBe(size);
        writeFileSync(
          path,
          `${JSON.stringify({ v: 1, ts: 2, type: 'session.idle', sessionID: 'ses_fixture', payload: {} })}\n`,
          { flag: 'a' },
        );
        const next = liveOf(
          await (await post(viewer, '/api/live', { cursors: folded.cursors })).json(),
        );
        expect(next.lines).toHaveLength(1);
      } finally {
        await viewer.stop();
      }
    });
  });

  it('keeps history after the NDJSON file is pruned', async () => {
    await withStore(async (directory) => {
      seed(directory);
      const first = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      await first.stop();
      rmSync(join(directory, '2026-10-28.ndjson'));
      const second = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      try {
        expect(await (await get(second, '/api/sessions')).json()).toHaveLength(1);
        expect(await (await get(second, '/api/spans?session=ses_fixture')).json()).toHaveLength(12);
      } finally {
        await second.stop();
      }
    });
  });

  it('stops on request and closes the port', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60_000 });
      expect(viewer.port).toBeGreaterThan(0);
      await viewer.stop();
      await expect(get(viewer, '/')).rejects.toThrow();
      await expect(get(viewer, '/')).rejects.toThrow();
    });
  });

  it('stops after the idle timeout without a heartbeat', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60 });
      await viewer.done;
      await expect(get(viewer, '/')).rejects.toThrow();
    });
  });

  it('closes after the pagehide grace period, and a heartbeat cancels it', async () => {
    await withStore(async (directory) => {
      const cancelled = await Viewer.start({ directory, idleMs: 60_000, closeDelayMs: 40 });
      await post(cancelled, '/close', {});
      await post(cancelled, '/heartbeat', {});
      await Bun.sleep(120);
      expect((await get(cancelled, '/')).status).toBe(200);
      await cancelled.stop();

      const closed = await Viewer.start({ directory, idleMs: 60_000, closeDelayMs: 20 });
      await post(closed, '/close', {});
      await closed.done;
      await expect(get(closed, '/')).rejects.toThrow();
    });
  });

  it('rejects foreign origins and hosts', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60_000 });
      try {
        expect((await get(viewer, '/', { origin: 'https://evil.example' })).status).toBe(403);
        expect((await get(viewer, '/', { host: 'evil.example' })).status).toBe(403);
        expect((await get(viewer, '/')).status).toBe(200);
      } finally {
        await viewer.stop();
      }
    });
  });

  it('rejects a malformed live request without a stack', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60_000 });
      try {
        const response = await Bun.fetch(`${viewer.url.replace(/\/$/u, '')}/api/live`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: '{oops',
        });
        expect(response.status).toBe(400);
        expect(await response.text()).not.toContain('at ');
      } finally {
        await viewer.stop();
      }
    });
  });

  it('returns live lines for every session so a switch does not drop them', async () => {
    await withStore(async (directory) => {
      seed(directory);
      const viewer = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      try {
        const folded = liveOf(await (await post(viewer, '/api/live', { fromFold: true })).json());
        writeFileSync(
          join(directory, '2026-10-28.ndjson'),
          `${JSON.stringify({ v: 1, ts: 2, type: 'session.idle', sessionID: 'ses_other', payload: {} })}\n${JSON.stringify({ v: 1, ts: 3, type: 'session.idle', sessionID: 'ses_fixture', payload: {} })}\n`,
          { flag: 'a' },
        );
        const next = liveOf(
          await (await post(viewer, '/api/live', { cursors: folded.cursors })).json(),
        );
        expect(next.lines.map((line) => line['sessionID'])).toStrictEqual([
          'ses_other',
          'ses_fixture',
        ]);
        const sessions = rowsOf(await (await get(viewer, '/api/sessions')).json());
        expect(sessions.map((session) => session['sessionID'])).toContain('ses_other');
      } finally {
        await viewer.stop();
      }
    });
  });

  it('resets the live cursor when a day file shrinks', async () => {
    await withStore(async (directory) => {
      const path = join(directory, '2026-10-28.ndjson');
      seed(directory);
      const viewer = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      try {
        const folded = liveOf(await (await post(viewer, '/api/live', { fromFold: true })).json());
        const rewritten = Array.from({ length: 40 }, (_, index) =>
          JSON.stringify({
            v: 1,
            ts: index + 1,
            type: 'session.idle',
            sessionID: 'ses_fixture',
            payload: {},
          }),
        );
        writeFileSync(path, `${rewritten.join('\n')}\n`);
        const next = liveOf(
          await (await post(viewer, '/api/live', { cursors: folded.cursors })).json(),
        );
        expect(next.lines).toHaveLength(40);
      } finally {
        await viewer.stop();
      }
    });
  });

  it('keeps the viewer alive while another tab is open', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60_000, closeDelayMs: 40 });
      try {
        await post(viewer, '/heartbeat', { id: 'tab-a' });
        await post(viewer, '/heartbeat', { id: 'tab-b' });
        await post(viewer, '/close', { id: 'tab-a' });
        await Bun.sleep(120);
        expect((await get(viewer, '/')).status).toBe(200);
      } finally {
        await viewer.stop();
      }
    });
  });

  it('returns a JSON error when a span payload is corrupt', async () => {
    await withStore(async (directory) => {
      seed(directory);
      const viewer = await Viewer.start({ directory, sessionID: 'ses_fixture', idleMs: 60_000 });
      const db = await Sqlite.open(join(directory, 'telemetry.db'), true);
      db.run(
        "INSERT INTO spans (file, session_id, ts, type, payload) VALUES ('x', 'ses_fixture', 1, 'session.idle', 'not-json')",
      );
      db.close();
      try {
        const response = await get(viewer, '/api/spans?session=ses_fixture');
        expect(response.status).toBe(500);
        expect(await response.text()).not.toContain('at ');
      } finally {
        await viewer.stop();
      }
    });
  });

  it('reports a history fold failure instead of hiding it', async () => {
    await withStore(async (directory) => {
      const database = join(directory, 'telemetry.db');
      const db = await Sqlite.open(database, true);
      db.exec('PRAGMA user_version = 99;');
      db.close();
      const viewer = await Viewer.start({ directory, idleMs: 60_000 });
      try {
        expect(viewer.foldError).toContain('newer');
        const status = Option.getOrUndefined(
          Schema.decodeUnknownOption(Schema.Struct({ foldError: Schema.NullOr(Schema.String) }))(
            await (await get(viewer, '/api/status')).json(),
          ),
        );
        expect(status?.foldError).toContain('newer');
      } finally {
        await viewer.stop();
      }
    });
  });

  it('escapes a session id embedded in the page script', () => {
    const html = Viewer.page('ses_</script><script>alert(1)</script>');
    expect(html).not.toContain('ses_</script><script>');
    expect(html).toContain('\\u003c/script');
  });

  it('ships parseable page scripts that use the shared window math', () => {
    const html = Viewer.page('ses_fixture');
    const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gu)].map(
      (match) => match[1] ?? '',
    );
    expect(scripts).toHaveLength(2);
    for (const script of scripts) expect(() => new Function(script)).not.toThrow();
    expect(scripts[1]).toContain('windowRange(');
    expect(html).toContain('MAX_WINDOW = 120');
    expect(html).toContain('No spans match this filter.');
  });
});

// SAFETY: the evaluated source is this module's own CLIENT_SCRIPT plus a literal expression written by the test.
const evaluate = <T>(expression: string): T =>
  new Function(`${Viewer.CLIENT_SCRIPT}\nreturn (${expression});`)() as T;

describe('Viewer client script', () => {
  it('keeps the window under the row budget for a 20k trace', () => {
    const ranges = evaluate<Array<{ start: number; end: number }>>(
      `[0, 1000, 100000, 319840].map((offset) => windowRange(20000, offset, 16, 60, 10))`,
    );
    for (const range of ranges) {
      expect(range.end - range.start).toBeLessThanOrEqual(80);
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(20_000);
    }
  });

  it('sums cost and tokens from step-ended spans only', () => {
    const total = evaluate<{ cost: number; input: number; output: number }>(`summaryOf([
      { type: 'session.step.ended', payload: { cost: 0.0012, tokens: { input: 120, output: 30 } } },
      { type: 'session.usage.updated', payload: { cost: 0.0012, tokens: { input: 120, output: 30 } } },
      { type: 'session.idle', payload: {} }
    ])`);
    expect(total).toStrictEqual({ cost: 0.0012, input: 120, output: 30 });
  });
});
