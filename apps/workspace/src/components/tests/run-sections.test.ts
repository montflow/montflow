import * as Vitest from '@effect/vitest';
import type { Runs } from '../../services/index.js';
import { activeRunRows, isActiveRunStatus, runSelectableRows } from '../run-sections.js';

const row = (id: string, status: string): Runs.RunSummary => ({
  id,
  name: id,
  description: '',
  status,
  model: '',
  thinking: '',
  tools: [],
  prompt: '',
  feature: '',
  progress: '',
  created: '',
  updated: '',
});

Vitest.describe('isActiveRunStatus', () => {
  Vitest.it('keeps queued and live runs in the Active section', () => {
    Vitest.expect(isActiveRunStatus('pending')).toBe(true);
    Vitest.expect(isActiveRunStatus('running')).toBe(true);
    Vitest.expect(isActiveRunStatus('awaiting-input')).toBe(true);
  });

  Vitest.it('treats terminal statuses as history', () => {
    Vitest.expect(isActiveRunStatus('done')).toBe(false);
    Vitest.expect(isActiveRunStatus('failed')).toBe(false);
    Vitest.expect(isActiveRunStatus('cancelled')).toBe(false);
    Vitest.expect(isActiveRunStatus('unknown')).toBe(false);
  });
});

Vitest.describe('activeRunRows', () => {
  Vitest.it('keeps only active runs, with running ahead of the queue', () => {
    const rows = [
      row('done-1', 'done'),
      row('queued-1', 'pending'),
      row('live-1', 'running'),
      row('parked-1', 'awaiting-input'),
      row('failed-1', 'failed'),
      row('live-2', 'running'),
    ];
    Vitest.expect(activeRunRows(rows).map((entry) => entry.id)).toStrictEqual([
      'live-1',
      'live-2',
      'queued-1',
      'parked-1',
    ]);
  });

  Vitest.it('returns an empty list when nothing is active', () => {
    Vitest.expect(activeRunRows([row('done-1', 'done')])).toStrictEqual([]);
  });
});

Vitest.describe('runSelectableRows', () => {
  Vitest.it('walks Active rows then the full list while All is expanded', () => {
    const active = [row('live-1', 'running')];
    const all = [row('live-1', 'running'), row('done-1', 'done')];
    const selectable = runSelectableRows(active, all, true);
    Vitest.expect(selectable.map((entry) => entry.id)).toStrictEqual([
      'live-1',
      'live-1',
      'done-1',
    ]);
    // The index across the section boundary reaches the first All row.
    Vitest.expect(selectable[active.length]?.id).toStrictEqual('live-1');
    Vitest.expect(selectable[active.length + 1]?.id).toStrictEqual('done-1');
  });

  Vitest.it('hides the full list from navigation while All is collapsed', () => {
    const active = [row('live-1', 'running')];
    const all = [row('live-1', 'running'), row('done-1', 'done')];
    Vitest.expect(runSelectableRows(active, all, false).map((entry) => entry.id)).toStrictEqual([
      'live-1',
    ]);
  });
});
