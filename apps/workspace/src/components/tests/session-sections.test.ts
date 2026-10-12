import * as Vitest from '@effect/vitest';
import type { Sessions } from '../../services/index.js';
import {
  activeSessionRows,
  isActiveSessionStatus,
  sessionSelectableRows,
} from '../session-sections.js';

const row = (id: string, status: string): Sessions.SessionSummary => ({
  id,
  name: id,
  description: '',
  status,
  model: '',
  thinking: '',
  tools: [],
  prompt: '',
  spec: '',
  progress: '',
  created: '',
  updated: '',
});

Vitest.describe('isActiveSessionStatus', () => {
  Vitest.it('keeps queued and live sessions in the Active section', () => {
    Vitest.expect(isActiveSessionStatus('pending')).toBe(true);
    Vitest.expect(isActiveSessionStatus('running')).toBe(true);
    Vitest.expect(isActiveSessionStatus('awaiting-input')).toBe(true);
  });

  Vitest.it('treats terminal statuses as history', () => {
    Vitest.expect(isActiveSessionStatus('done')).toBe(false);
    Vitest.expect(isActiveSessionStatus('failed')).toBe(false);
    Vitest.expect(isActiveSessionStatus('cancelled')).toBe(false);
    Vitest.expect(isActiveSessionStatus('unknown')).toBe(false);
  });
});

Vitest.describe('activeSessionRows', () => {
  Vitest.it('keeps only active sessions, with running ahead of the queue', () => {
    const rows = [
      row('done-1', 'done'),
      row('queued-1', 'pending'),
      row('live-1', 'running'),
      row('parked-1', 'awaiting-input'),
      row('failed-1', 'failed'),
      row('live-2', 'running'),
    ];
    Vitest.expect(activeSessionRows(rows).map((entry) => entry.id)).toStrictEqual([
      'live-1',
      'live-2',
      'queued-1',
      'parked-1',
    ]);
  });

  Vitest.it('returns an empty list when nothing is active', () => {
    Vitest.expect(activeSessionRows([row('done-1', 'done')])).toStrictEqual([]);
  });
});

Vitest.describe('sessionSelectableRows', () => {
  Vitest.it('walks Active rows then the full list while All is expanded', () => {
    const active = [row('live-1', 'running')];
    const all = [row('live-1', 'running'), row('done-1', 'done')];
    const selectable = sessionSelectableRows(active, all, true);
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
    Vitest.expect(sessionSelectableRows(active, all, false).map((entry) => entry.id)).toStrictEqual(
      ['live-1'],
    );
  });
});
