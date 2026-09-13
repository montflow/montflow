// eslint-disable-next-line montflow/no-node-platform-imports -- test scratch roots live outside the store; mirrors the production boundary.
import { mkdtempSync } from 'node:fs';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: tmpdir for scratch roots.
import { tmpdir } from 'node:os';
// eslint-disable-next-line montflow/no-node-platform-imports -- same boundary as above: path joins for scratch roots.
import { join } from 'node:path';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { cancelRun, createRun, fetchRuns, loadRun } from '../runs.services.module.js';

/** Unique scratch root per test — no shared state across files. */
const freshRoot = (): string => mkdtempSync(join(tmpdir(), 'workspace-runs-test-'));

describe('runs service store wiring', () => {
  it('creates, lists, loads, and cancels a run', async () => {
    const root = freshRoot();
    const created = await createRun(root, {
      name: 'Fix login',
      prompt: 'Fix it.',
      model: undefined,
    }).pipe(Effect.runPromise);
    expect(created.status).toBe('running');
    expect(created.prompt).toBe('Fix it.');
    const listed = await fetchRuns(root).pipe(Effect.runPromise);
    expect(listed.map((row) => row.id)).toContain(created.id);
    const detail = await loadRun(root, created.id).pipe(Effect.runPromise);
    expect(detail.events.length).toBe(1);
    expect(detail.events[0]?.role).toBe('user');
    await cancelRun(root, created.id).pipe(Effect.runPromise);
    const reloaded = await loadRun(root, created.id).pipe(Effect.runPromise);
    expect(reloaded.summary.status).toBe('cancelled');
    expect(reloaded.receipt?.outcome).toBe('cancelled');
  }, 30_000);
});
