import { test, expect, describe } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  openRunStore,
  encodeEntries,
  decodeEntries,
  encodeTools,
  decodeTools,
  type StoredRun,
} from '../run-store';

const now = Date.now();

const sampleRun = (overrides: Partial<StoredRun> = {}): StoredRun => ({
  runId: 'run-1',
  folder: 'feat-branch',
  workspaceId: 'ws-abc',
  status: 'done',
  entries: [
    { role: 'user', text: 'Create a preset.' },
    { role: 'assistant', text: 'Created **security-audit**.' },
  ],
  tools: [
    { name: 'write', status: 'done', turn: 1, args: { path: 'a.md', content: 'hi' } },
    { name: 'read', status: 'running', turn: 1, args: { path: 'a.md' } },
  ],
  updatedAt: now,
  ...overrides,
});

/** Fresh temp dir + db path, cleaned up after the callback settles. */
const withDb = async <T>(fn: (dbPath: string) => Promise<T>): Promise<T> => {
  const dir = await mkdtemp(join(tmpdir(), 'runstore-'));
  try {
    return await fn(join(dir, 'runs.db'));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
};

describe('run-store schema codecs', () => {
  test('entries round-trip through the JSON column codec', () => {
    expect(decodeEntries(encodeEntries(sampleRun().entries))).toEqual(sampleRun().entries);
  });

  test('tools round-trip through the JSON column codec', () => {
    expect(decodeTools(encodeTools(sampleRun().tools))).toEqual(sampleRun().tools);
  });

  test('tools without args (legacy snapshots) round-trip as undefined', () => {
    const legacy = [{ name: 'read', status: 'done', turn: 1 }] as const;
    expect(decodeTools(encodeTools(legacy))).toEqual(legacy);
  });

  test('decoding rejects malformed JSON', () => {
    expect(() => decodeEntries('not json')).toThrow();
  });

  test('decoding rejects schema-invalid entries', () => {
    expect(() => decodeEntries('[{"role":"bogus","text":"x"}]')).toThrow();
  });
});

describe('sqlite run store', () => {
  test('upsert + load round-trips a run', async () => {
    await withDb(async (dbPath) => {
      const store = await openRunStore(dbPath);
      expect(store).not.toBeNull();
      const s = store!;
      s.upsert(sampleRun());
      expect(s.load('run-1')).toEqual(sampleRun());
      s.close();
    });
  });

  test('upsert overwrites an existing run id', async () => {
    await withDb(async (dbPath) => {
      const store = await openRunStore(dbPath);
      const s = store!;
      s.upsert(sampleRun());
      s.upsert(sampleRun({ status: 'error', updatedAt: now + 1 }));
      const loaded = s.load('run-1');
      expect(loaded).not.toBeNull();
      expect(loaded!.status).toBe('error');
      expect(loaded!.updatedAt).toBe(now + 1);
      s.close();
    });
  });

  test('load returns null for unknown runs', async () => {
    await withDb(async (dbPath) => {
      const store = await openRunStore(dbPath);
      expect(store!.load('nope')).toBeNull();
      store!.close();
    });
  });

  test('list returns runs newest first', async () => {
    await withDb(async (dbPath) => {
      const store = await openRunStore(dbPath);
      const s = store!;
      s.upsert(sampleRun({ runId: 'old', updatedAt: now - 1000 }));
      s.upsert(sampleRun({ runId: 'new', updatedAt: now }));
      expect(s.list().map((r) => r.runId)).toEqual(['new', 'old']);
      s.close();
    });
  });

  test('corrupt rows are nulled by load and skipped by list', async () => {
    await withDb(async (dbPath) => {
      const store = await openRunStore(dbPath);
      const s = store!;
      s.upsert(sampleRun());
      s.upsert(sampleRun({ runId: 'corrupt' }));
      s.close();

      // Corrupt the second row's JSON column behind the store's back.
      const { DatabaseSync } = await import('node:sqlite');
      const raw = new DatabaseSync(dbPath);
      raw.prepare("UPDATE runs SET entries = 'not json' WHERE run_id = 'corrupt'").run();
      raw.close();

      const reopened = await openRunStore(dbPath);
      const s2 = reopened!;
      expect(s2.load('corrupt')).toBeNull();
      expect(s2.load('run-1')).toEqual(sampleRun());
      expect(s2.list().map((r) => r.runId)).toEqual(['run-1']);
      s2.close();
    });
  });

  test('older-than-retention snapshots are pruned on open', async () => {
    await withDb(async (dbPath) => {
      const store = await openRunStore(dbPath);
      store!.upsert(sampleRun({ runId: 'old', updatedAt: now - 40 * 24 * 60 * 60 * 1000 }));
      store!.close();

      const reopened = await openRunStore(dbPath);
      expect(reopened!.load('old')).toBeNull();
      reopened!.close();
    });
  });
});
