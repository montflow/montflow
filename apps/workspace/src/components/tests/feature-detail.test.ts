import * as Vitest from '@effect/vitest';
import type { FeatureDetail } from '../../services/features/index.js';
import { featureDetailLines, featureMarker, featureTaskMarker } from '../feature-markers.js';

const detail: FeatureDetail = {
  summary: {
    id: 'ship-feature',
    name: 'ship-feature',
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
    name: 'ship-feature',
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
      message: "Feature status is 'complete' but 1 task is not complete: A002 (pending).",
    },
  ],
};

Vitest.describe('featureDetailLines runtime', () => {
  Vitest.it('renders the header, issues, and per-phase tasks', () => {
    const lines = featureDetailLines(detail);
    Vitest.expect(lines).toContain('state    inconsistent');
    Vitest.expect(lines).toContain('tasks    2/3 complete');
    Vitest.expect(lines).toContain('issues');
    Vitest.expect(lines).toContain(
      "  status: Feature status is 'complete' but 1 task is not complete: A002 (pending).",
    );
    Vitest.expect(lines).toContain('Phase A · locked');
    Vitest.expect(lines.some((line) => line.includes('A001') && line.includes('✓'))).toBe(true);
    Vitest.expect(lines.some((line) => line.includes('A002') && line.includes('○'))).toBe(true);
    Vitest.expect(lines).toContain('Phase B');
  });
});

Vitest.describe('featureMarker runtime', () => {
  Vitest.it('maps lifecycle states to glyphs', () => {
    Vitest.expect(featureMarker('complete')).toBe('✓');
    Vitest.expect(featureMarker('in-progress')).toBe('●');
    Vitest.expect(featureMarker('blocked')).toBe('■');
    Vitest.expect(featureMarker('inconsistent')).toBe('✗');
    Vitest.expect(featureMarker('pending')).toBe('○');
    Vitest.expect(featureMarker('weird')).toBe('·');
  });
});

Vitest.describe('featureTaskMarker runtime', () => {
  Vitest.it('maps task statuses to glyphs', () => {
    Vitest.expect(featureTaskMarker('complete')).toBe('✓');
    Vitest.expect(featureTaskMarker('in-progress')).toBe('●');
    Vitest.expect(featureTaskMarker('blocked')).toBe('✗');
    Vitest.expect(featureTaskMarker('pending')).toBe('○');
    Vitest.expect(featureTaskMarker('weird')).toBe('·');
  });
});
