import * as Vitest from '@effect/vitest';
import * as Feature from '../index.js';

const body = [
  '## Tasks',
  '',
  '| ID | Name | Type | Status | Gates |',
  '|---|---|---|---|---|',
  '| A001 | implement-login | execution | pending | No |',
  '| A002 | review-phase | review | in-progress | Yes |',
  '',
].join('\n');

Vitest.describe('Feature.parseTaskTable runtime', () => {
  Vitest.it('parses task rows and ignores the header and separator', () => {
    Vitest.expect(Feature.parseTaskTable(body)).toStrictEqual([
      { id: 'A001', name: 'implement-login', type: 'execution', status: 'pending', gates: false },
      { id: 'A002', name: 'review-phase', type: 'review', status: 'in-progress', gates: true },
    ]);
  });

  Vitest.it('returns an empty list when there is no task table', () => {
    Vitest.expect(Feature.parseTaskTable('## Description\n\nNothing.\n')).toStrictEqual([]);
  });
});
