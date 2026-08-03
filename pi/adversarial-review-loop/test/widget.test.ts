import { test, expect, vi } from 'vitest';
import { Option } from 'effect';
import { clearLoopWidget, renderLoopWidget, setLoopWidget } from '../widget';

test('renderLoopWidget: includes cycle, supervisor, and reviewer rows', () => {
  const lines = renderLoopWidget({
    cycle: 2,
    maxLoops: 5,
    supervisor: 'aggregating',
    supervisorDetail: 'merging scratch',
    reviewers: [
      { id: 'technical', label: 'Technical', status: 'done', findingCount: 4 },
      { id: 'style', label: 'Style', status: 'running' },
    ],
    reconcile: 'skipped',
    reconcileDetail: 'supervisor aggregate',
    fixer: 'waiting',
    summary: Option.some({
      open: 3,
      inReview: 1,
      escalated: 0,
      resolved: 5,
      wontFix: 0,
    }),
    deadlocks: 0,
    phase: 'supervisor:aggregate',
  });

  expect(lines[0]).toContain('cycle 2/5');
  expect(lines.some((line) => line.includes('supervisor') && line.includes('aggregating'))).toBe(
    true,
  );
  expect(lines.some((line) => line.includes('Technical') && line.includes('done'))).toBe(true);
  expect(lines.some((line) => line.includes('reconcile') && line.includes('supervisor'))).toBe(
    true,
  );
  expect(lines.some((line) => line.includes('Open 3'))).toBe(true);
});

test('setLoopWidget / clearLoopWidget: call through ui', () => {
  const setWidget = vi.fn();
  setLoopWidget(
    { setWidget },
    {
      cycle: 1,
      maxLoops: 5,
      supervisor: 'skipped',
      reviewers: [{ id: 'generic', label: 'Generic', status: 'pending' }],
      reconcile: 'idle',
      fixer: 'waiting',
      summary: Option.none(),
      deadlocks: 0,
      phase: 'starting',
    },
  );
  expect(setWidget).toHaveBeenCalledWith(
    'adversarial-review-loop',
    expect.arrayContaining([expect.stringContaining('cycle 1/5')]),
  );
  clearLoopWidget({ setWidget });
  expect(setWidget).toHaveBeenCalledWith('adversarial-review-loop', undefined);
});
