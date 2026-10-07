import * as Vitest from '@effect/vitest';
import type { SpecDetail } from '../../services/specs/index.js';
import { specDetailLines, specMarker, specTaskMarker } from '../spec-markers.js';

const detail: SpecDetail = {
  summary: {
    id: 'ship-spec',
    name: 'ship-spec',
    description: 'Ship it.',
    state: 'inconsistent',
    status: 'complete',
    active: false,
    total: 3,
    complete: 2,
    issues: 1,
    valid: false,
  },
  meta: {
    name: 'ship-spec',
    status: 'complete',
    workspaceType: 'in-place',
    author: 'Tester',
    created: '2026-01-01',
    lockedPhases: ['A'],
    description: 'Ship it.',
  },
  state: 'inconsistent',
  counts: { pending: 1, 'in-progress': 0, complete: 2, blocked: 0 },
  phases: [
    {
      phase: 'A',
      locked: true,
      tasks: [
        { id: 'A001', name: 'implement-login', type: 'execution', status: 'complete' },
        { id: 'A002', name: 'wire-login', type: 'execution', status: 'pending' },
      ],
    },
    {
      phase: 'B',
      locked: false,
      tasks: [{ id: 'B001', name: 'ship-it', type: 'review', status: 'complete' }],
    },
  ],
  issues: [
    {
      field: 'status',
      message: "Spec status is 'complete' but 1 task is not complete: A002 (pending).",
    },
  ],
};

Vitest.describe('specDetailLines runtime', () => {
  Vitest.it('renders the header, issues, and per-phase tasks', () => {
    const lines = specDetailLines(detail);
    Vitest.expect(lines).toContain('state    inconsistent');
    Vitest.expect(lines).toContain('tasks    2/3 complete');
    Vitest.expect(lines).toContain('issues');
    Vitest.expect(lines).toContain(
      "  status: Spec status is 'complete' but 1 task is not complete: A002 (pending).",
    );
    Vitest.expect(lines).toContain('Phase A · locked');
    Vitest.expect(lines.some((line) => line.includes('A001') && line.includes('✓'))).toBe(true);
    Vitest.expect(lines.some((line) => line.includes('A002') && line.includes('○'))).toBe(true);
    Vitest.expect(lines).toContain('Phase B');
  });
});

Vitest.describe('specMarker runtime', () => {
  Vitest.it('maps lifecycle states to glyphs', () => {
    Vitest.expect(specMarker('complete')).toBe('✓');
    Vitest.expect(specMarker('in-progress')).toBe('●');
    Vitest.expect(specMarker('blocked')).toBe('■');
    Vitest.expect(specMarker('inconsistent')).toBe('✗');
    Vitest.expect(specMarker('pending')).toBe('○');
    Vitest.expect(specMarker('weird')).toBe('·');
  });
});

Vitest.describe('specTaskMarker runtime', () => {
  Vitest.it('maps task statuses to glyphs', () => {
    Vitest.expect(specTaskMarker('complete')).toBe('✓');
    Vitest.expect(specTaskMarker('in-progress')).toBe('●');
    Vitest.expect(specTaskMarker('blocked')).toBe('✗');
    Vitest.expect(specTaskMarker('pending')).toBe('○');
    Vitest.expect(specTaskMarker('weird')).toBe('·');
  });
});
