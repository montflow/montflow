import * as Vitest from '@effect/vitest';
import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as Fold from '../index.js';

const fixture = fileURLToPath(new URL('./fixtures/session.ndjson', import.meta.url));

const withStore = async (run: (directory: string) => Promise<void>): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-fold-'));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const seed = (directory: string): string => {
  const path = join(directory, '2026-10-28.ndjson');
  copyFileSync(fixture, path);
  return path;
};

Vitest.describe('Fold.run runtime', () => {
  Vitest.it('folds a fixture into span rows and session totals', async () => {
    await withStore(async (directory) => {
      seed(directory);
      const database = join(directory, 'telemetry.db');
      const result = await Fold.run({ directory, database });
      Vitest.expect(result.spans).toBe(12);
      const sessions = await Fold.sessions(database);
      Vitest.expect(sessions).toHaveLength(1);
      const [session] = sessions;
      Vitest.expect(session?.sessionID).toBe('ses_fixture');
      Vitest.expect(session?.title).toBe('telemetry');
      Vitest.expect(session?.spanCount).toBe(12);
      Vitest.expect(session?.costUSD).toBeCloseTo(0.0012);
      Vitest.expect(session?.inputTokens).toBe(120);
      Vitest.expect(session?.outputTokens).toBe(30);
      const spans = await Fold.spans(database, 'ses_fixture');
      Vitest.expect(spans).toHaveLength(12);
      Vitest.expect(spans[0]?.type).toBe('session.created');
      Vitest.expect(spans.at(-1)?.type).toBe('session.idle');
    });
  });

  Vitest.it('is idempotent across two runs and folds only appended bytes', async () => {
    await withStore(async (directory) => {
      const path = seed(directory);
      const database = join(directory, 'telemetry.db');
      await Fold.run({ directory, database });
      const second = await Fold.run({ directory, database });
      Vitest.expect(second).toStrictEqual({ files: 0, spans: 0 });
      Vitest.expect(await Fold.spans(database, 'ses_fixture')).toHaveLength(12);

      writeFileSync(
        path,
        `${JSON.stringify({
          v: 1,
          ts: 1793178012000,
          type: 'session.step.ended',
          sessionID: 'ses_fixture',
          payload: { sessionID: 'ses_fixture', cost: 0.0008, tokens: { input: 10, output: 5 } },
        })}\n`,
        { flag: 'a' },
      );
      const third = await Fold.run({ directory, database });
      Vitest.expect(third.spans).toBe(1);
      const sessions = await Fold.sessions(database);
      Vitest.expect(sessions[0]?.spanCount).toBe(13);
      Vitest.expect(sessions[0]?.costUSD).toBeCloseTo(0.002);
      Vitest.expect(sessions[0]?.inputTokens).toBe(130);
    });
  });

  Vitest.it('keeps history after the source NDJSON is pruned', async () => {
    await withStore(async (directory) => {
      const path = seed(directory);
      const database = join(directory, 'telemetry.db');
      await Fold.run({ directory, database });
      rmSync(path);
      Vitest.expect(await Fold.sessions(database)).toHaveLength(1);
      Vitest.expect(await Fold.spans(database, 'ses_fixture')).toHaveLength(12);
    });
  });

  Vitest.it('returns empty history for an absent store', async () => {
    await withStore(async (directory) => {
      const database = join(directory, 'telemetry.db');
      Vitest.expect(await Fold.sessions(database)).toStrictEqual([]);
      Vitest.expect(await Fold.spans(database, 'ses_fixture')).toStrictEqual([]);
      Vitest.expect(
        await Fold.run({ directory: join(directory, 'missing'), database }),
      ).toStrictEqual({ files: 0, spans: 0 });
    });
  });

  Vitest.it('resets a file that shrank instead of skipping it forever', async () => {
    await withStore(async (directory) => {
      const path = seed(directory);
      const database = join(directory, 'telemetry.db');
      await Fold.run({ directory, database });
      Vitest.expect(await Fold.spans(database, 'ses_fixture')).toHaveLength(12);
      writeFileSync(
        path,
        `${JSON.stringify({
          v: 1,
          ts: 1,
          type: 'session.created',
          sessionID: 'ses_fixture',
          payload: { sessionID: 'ses_fixture', slug: 'rewritten' },
        })}\n`,
      );
      const result = await Fold.run({ directory, database });
      Vitest.expect(result.spans).toBe(1);
      const spans = await Fold.spans(database, 'ses_fixture');
      Vitest.expect(spans).toHaveLength(1);
      Vitest.expect(spans[0]?.type).toBe('session.created');
      Vitest.expect((await Fold.sessions(database))[0]?.title).toBe('rewritten');
    });
  });

  Vitest.it('folds every line after an empty truncate and rewrite', async () => {
    await withStore(async (directory) => {
      const path = seed(directory);
      const database = join(directory, 'telemetry.db');
      await Fold.run({ directory, database });
      writeFileSync(path, '');
      await Fold.run({ directory, database });
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
      const result = await Fold.run({ directory, database });
      Vitest.expect(result.spans).toBe(40);
      Vitest.expect(await Fold.spans(database, 'ses_fixture')).toHaveLength(40);
    });
  });

  Vitest.it('serializes two concurrent folds without duplicating spans', async () => {
    await withStore(async (directory) => {
      const lines = Array.from({ length: 20_000 }, (_, index) =>
        JSON.stringify({
          v: 1,
          ts: index + 1,
          type: 'session.step.ended',
          sessionID: 'ses_big',
          payload: { sessionID: 'ses_big', cost: 0.001, tokens: { input: 1, output: 1 } },
        }),
      );
      writeFileSync(join(directory, '2026-10-28.ndjson'), `${lines.join('\n')}\n`);
      const database = join(directory, 'telemetry.db');
      await Promise.all([Fold.run({ directory, database }), Fold.run({ directory, database })]);
      Vitest.expect(await Fold.spans(database, 'ses_big')).toHaveLength(20_000);
      Vitest.expect((await Fold.sessions(database))[0]?.spanCount).toBe(20_000);
    });
  });
});
