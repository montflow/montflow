import { describe, expect, it } from 'bun:test';
import { Option, Schema } from 'effect';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Viewer from '../index.js';

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

const decodeLive = Schema.decodeUnknownOption(
  Schema.Struct({
    lines: Schema.Array(Schema.Unknown),
    cursors: Schema.Record(Schema.String, Schema.Number),
  }),
);
const decodeList = Schema.decodeUnknownOption(Schema.Array(Schema.Unknown));
const dataOf = <T>(option: Option.Option<T>): T => {
  const value = Option.getOrUndefined(option);
  if (value === undefined) throw new Error('unexpected response body');
  return value;
};

const get = (viewer: Viewer.Viewer, path: string): Promise<Response> =>
  Bun.fetch(`${viewer.url.replace(/\/$/u, '')}${path}`);

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
        expect(html).toContain(`WINDOW = ${Viewer.WINDOW_ROWS}`);
        expect(Viewer.WINDOW_ROWS).toBeLessThanOrEqual(120);
        expect(dataOf(decodeList(await (await get(viewer, '/api/sessions')).json()))).toStrictEqual(
          [],
        );
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
        expect(dataOf(decodeList(await (await get(viewer, '/api/sessions')).json()))).toHaveLength(
          1,
        );
        expect(
          dataOf(decodeList(await (await get(viewer, '/api/spans?session=ses_fixture')).json())),
        ).toHaveLength(12);

        const first = dataOf(
          decodeLive(
            await (
              await post(viewer, '/api/live', { sessionID: 'ses_fixture', cursors: {} })
            ).json(),
          ),
        );
        expect(first.lines).toHaveLength(12);

        const second = dataOf(
          decodeLive(
            await (
              await post(viewer, '/api/live', {
                sessionID: 'ses_fixture',
                cursors: first.cursors,
              })
            ).json(),
          ),
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
        const third = dataOf(
          decodeLive(
            await (
              await post(viewer, '/api/live', {
                sessionID: 'ses_fixture',
                cursors: second.cursors,
              })
            ).json(),
          ),
        );
        expect(third.lines).toHaveLength(1);
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
        expect(dataOf(decodeList(await (await get(second, '/api/sessions')).json()))).toHaveLength(
          1,
        );
        expect(
          dataOf(decodeList(await (await get(second, '/api/spans?session=ses_fixture')).json())),
        ).toHaveLength(12);
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

  it('stops on the page close beacon', async () => {
    await withStore(async (directory) => {
      const viewer = await Viewer.start({ directory, idleMs: 60_000 });
      await post(viewer, '/close', {});
      await viewer.done;
      await expect(get(viewer, '/')).rejects.toThrow();
    });
  });
});

describe('Viewer.windowRange runtime', () => {
  it('never exceeds the row budget for a 20k trace', () => {
    for (const offset of [0, 1_000, 100_000, 319_840]) {
      const range = Viewer.windowRange(20_000, offset);
      expect(range.end - range.start).toBeLessThanOrEqual(Viewer.WINDOW_ROWS + 20);
      expect(range.start).toBeGreaterThanOrEqual(0);
      expect(range.end).toBeLessThanOrEqual(20_000);
    }
  });

  it('is empty for an empty trace', () => {
    expect(Viewer.windowRange(0, 0)).toStrictEqual({ start: 0, end: 0 });
  });
});
