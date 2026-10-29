import * as Vitest from '@effect/vitest';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IncomingInput } from '../../event/index.js';
import Server, { setup, type CommandDefinition, type HostSlice } from '../../../server.js';

const fixtureUrl = new URL('../../event/tests/fixtures/session.ndjson', import.meta.url);

const recorded = (): IncomingInput[] =>
  readFileSync(fixtureUrl, 'utf8')
    .split('\n')
    .filter((row) => row.length > 0)
    .map((row) => JSON.parse(row));

const contextOf = (directory: string, events: readonly IncomingInput[]): HostSlice => ({
  options: { directory },
  event: {
    subscribe: () => ({
      async *[Symbol.asyncIterator]() {
        for (const event of events) yield event;
      },
    }),
  },
});

const withTemp = async (run: (directory: string) => Promise<void>): Promise<void> => {
  const directory = mkdtempSync(join(tmpdir(), 'telemetry-server-'));
  try {
    await run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

Vitest.describe('Server.setup runtime', () => {
  Vitest.it('exposes the montflow.telemetry plugin id and setup', () => {
    Vitest.expect(Server.id).toBe('montflow.telemetry');
    Vitest.expect(setup).toBeTypeOf('function');
  });

  Vitest.it('exposes the ./server entry the host loader resolves', async () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../../../package.json', import.meta.url), 'utf8'),
    );
    Vitest.expect(manifest.exports['./server']).toBe('./src/server.ts');
    const loaded = await import('../../../server.js');
    Vitest.expect(loaded.default.id).toBe('montflow.telemetry');
    Vitest.expect(loaded.default.setup).toBeTypeOf('function');
  });

  Vitest.it('writes a recorded session with no external service running', async () => {
    await withTemp(async (directory) => {
      const cleanup = await setup(contextOf(directory, recorded()));
      if (cleanup !== undefined) await cleanup();
      const rows = readFileSync(join(directory, '2026-10-28.ndjson'), 'utf8')
        .split('\n')
        .filter((row) => row.length > 0);
      Vitest.expect(rows).toHaveLength(11);
      Vitest.expect(JSON.parse(rows[0] ?? '{}').sessionID).toBe('ses_fixture');
    });
  });

  Vitest.it('leaves no file when a session emits nothing', async () => {
    await withTemp(async (directory) => {
      const cleanup = await setup(contextOf(directory, []));
      if (cleanup !== undefined) await cleanup();
      Vitest.expect(() => readFileSync(join(directory, '2026-10-28.ndjson'))).toThrow();
    });
  });

  Vitest.it('returns a safe no-op cleanup when the subscription cannot start', async () => {
    await withTemp(async (directory) => {
      const broken: HostSlice = {
        ...contextOf(directory, []),
        event: {
          subscribe: () => {
            throw new Error('no host');
          },
        },
      };
      const cleanup = await setup(broken);
      Vitest.expect(cleanup).toBeTypeOf('function');
      if (cleanup !== undefined) await cleanup();
    });
  });

  Vitest.it('registers /mf-telemetry and disposes it on cleanup', async () => {
    await withTemp(async (directory) => {
      const registered: CommandDefinition[] = [];
      let disposed = false;
      const context: HostSlice = {
        ...contextOf(directory, []),
        command: {
          transform: async (callback) => {
            callback({ add: (definition) => registered.push(definition) });
            return {
              dispose: async () => {
                disposed = true;
              },
            };
          },
        },
      };
      const cleanup = await setup(context);
      Vitest.expect(registered.map((definition) => definition.name)).toStrictEqual([
        'mf-telemetry',
      ]);
      Vitest.expect(registered[0]?.execute).toBeTypeOf('function');
      if (cleanup !== undefined) await cleanup();
      Vitest.expect(disposed).toBe(true);
    });
  });

  Vitest.it('keeps collecting when retentionDays is negative', async () => {
    await withTemp(async (directory) => {
      const context = {
        ...contextOf(directory, recorded()),
        options: { directory, retentionDays: -5 },
      };
      const cleanup = await setup(context);
      if (cleanup !== undefined) await cleanup();
      const rows = readFileSync(join(directory, '2026-10-28.ndjson'), 'utf8')
        .split('\n')
        .filter((row) => row.length > 0);
      Vitest.expect(rows).toHaveLength(11);
    });
  });

  Vitest.it('is idempotent and swallows a rejecting command dispose', async () => {
    await withTemp(async (directory) => {
      const context: HostSlice = {
        ...contextOf(directory, []),
        command: {
          transform: async (callback) => {
            callback({ add: () => {} });
            return {
              dispose: async () => {
                throw new Error('host dispose failed');
              },
            };
          },
        },
      };
      const cleanup = await setup(context);
      if (cleanup === undefined) throw new Error('expected cleanup');
      await Vitest.expect(cleanup()).resolves.toBeUndefined();
      await Vitest.expect(cleanup()).resolves.toBeUndefined();
    });
  });
});
