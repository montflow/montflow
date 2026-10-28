import * as Vitest from '@effect/vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Config from '../../config/index.js';
import { sha256 } from '../../digest/index.js';
import type { IncomingInput, Line } from '../../event/index.js';
import * as Store from '../../store/index.js';
import * as Plugin from '../index.js';

const fixtureUrl = new URL('../../event/tests/fixtures/session.ndjson', import.meta.url);

const recorded = (): IncomingInput[] =>
  readFileSync(fixtureUrl, 'utf8')
    .split('\n')
    .filter((row) => row.length > 0)
    .map((row) => JSON.parse(row));

const settings = (overrides: Partial<Config.Settings> = {}): Config.Settings => ({
  directory: '/tmp/unused',
  retentionDays: 30,
  captureDeltas: false,
  captureBodies: false,
  ...overrides,
});

const stream = (events: readonly IncomingInput[]): AsyncIterable<IncomingInput> => ({
  async *[Symbol.asyncIterator]() {
    for (const event of events) yield event;
  },
});

const linesOf = (path: string): Line[] =>
  readFileSync(path, 'utf8')
    .split('\n')
    .filter((row) => row.length > 0)
    .map((row) => JSON.parse(row));

const consume = (
  events: AsyncIterable<IncomingInput>,
  writer: Store.Writer,
  resolved: Config.Settings,
  notify: (message: string) => void = () => {},
) => Plugin.consume(events, writer, resolved, () => 0, sha256, notify);

const withTemp = async (run: (directory: string) => Promise<void>): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-plugin-'));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

Vitest.describe('Plugin.consume runtime', () => {
  Vitest.it('replays a recorded session in order with session attribution', async () => {
    await withTemp(async (directory) => {
      const events = recorded();
      const writer = Store.make({ directory, notify: () => {} });
      await consume(stream(events), writer, settings({ directory }));
      writer.close();
      const written = linesOf(join(directory, '2026-10-28.ndjson'));
      Vitest.expect(written.map((line) => line.type)).toStrictEqual(
        events.map((event) => event.type).filter((type) => type !== 'session.text.delta'),
      );
      Vitest.expect(new Set(written.map((line) => line.sessionID))).toStrictEqual(
        new Set(['ses_fixture']),
      );
      Vitest.expect(written.map((line) => line.ts)).toStrictEqual(
        events.filter((event) => event.type !== 'session.text.delta').map((event) => event.created),
      );
      Vitest.expect(written.every((line) => line.v === 1)).toBe(true);
    });
  });

  Vitest.it('persists deltas when captureDeltas is enabled', async () => {
    await withTemp(async (directory) => {
      const writer = Store.make({ directory, notify: () => {} });
      await consume(stream(recorded()), writer, settings({ directory, captureDeltas: true }));
      writer.close();
      const written = linesOf(join(directory, '2026-10-28.ndjson'));
      Vitest.expect(written).toHaveLength(12);
      Vitest.expect(written[3]?.type).toBe('session.text.delta');
    });
  });

  Vitest.it('does not reject when the writer fails', async () => {
    await withTemp(async (directory) => {
      const writer = Store.make({
        directory,
        notify: () => {},
        write: () => {
          throw new Error('disk full');
        },
      });
      await Vitest.expect(
        consume(stream(recorded()), writer, settings({ directory })),
      ).resolves.toBeUndefined();
      Vitest.expect(writer.disabled).toBe(true);
    });
  });

  Vitest.it('reports a stream failure once and does not reject', async () => {
    await withTemp(async (directory) => {
      const writer = Store.make({ directory, notify: () => {} });
      const [first] = recorded();
      if (first === undefined) throw new Error('fixture is empty');
      const broken: AsyncIterable<IncomingInput> = {
        async *[Symbol.asyncIterator]() {
          yield first;
          throw new Error('socket closed');
        },
      };
      const reported: string[] = [];
      await Vitest.expect(
        consume(broken, writer, settings({ directory }), (message) => reported.push(message)),
      ).resolves.toBeUndefined();
      writer.close();
      Vitest.expect(linesOf(join(directory, '2026-10-28.ndjson'))).toHaveLength(1);
      Vitest.expect(reported).toHaveLength(1);
      Vitest.expect(reported[0]).toContain('socket closed');
    });
  });
});
