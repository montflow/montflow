import * as Vitest from '@effect/vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as Config from '../../config/index.js';
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
      await Plugin.consume(stream(events), writer, settings({ directory }), () => 0);
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
      await Plugin.consume(
        stream(recorded()),
        writer,
        settings({ directory, captureDeltas: true }),
        () => 0,
      );
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
        Plugin.consume(stream(recorded()), writer, settings({ directory }), () => 0),
      ).resolves.toBeUndefined();
      Vitest.expect(writer.disabled).toBe(true);
    });
  });

  Vitest.it('does not reject when the subscription fails mid-stream', async () => {
    await withTemp(async (directory) => {
      const writer = Store.make({ directory, notify: () => {} });
      const broken: AsyncIterable<IncomingInput> = {
        async *[Symbol.asyncIterator]() {
          yield recorded()[0]!;
          throw new Error('socket closed');
        },
      };
      await Vitest.expect(
        Plugin.consume(broken, writer, settings({ directory }), () => 0),
      ).resolves.toBeUndefined();
      writer.close();
      Vitest.expect(linesOf(join(directory, '2026-10-28.ndjson'))).toHaveLength(1);
    });
  });
});
