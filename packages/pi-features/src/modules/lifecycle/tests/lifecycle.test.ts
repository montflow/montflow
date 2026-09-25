import * as Vitest from '@effect/vitest';
import * as Lifecycle from '../index.js';

const pending = { id: 'A001', status: 'pending' } as const;
const reviewPending = { id: 'A099', status: 'pending' } as const;
const done = { id: 'A001', status: 'complete' } as const;
const reviewDone = { id: 'A099', status: 'complete' } as const;

Vitest.describe('Lifecycle.analyze runtime', () => {
  Vitest.it('reports not-started when nothing has moved off pending', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      lockedPhases: [],
      tasks: [pending, reviewPending],
    });
    Vitest.expect(result.state).toBe('not-started');
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('reports in-progress when some work is done', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      lockedPhases: [],
      tasks: [done, reviewPending],
    });
    Vitest.expect(result.state).toBe('in-progress');
    Vitest.expect(result.counts).toStrictEqual({
      pending: 1,
      'in-progress': 0,
      complete: 1,
      blocked: 0,
    });
  });

  Vitest.it('reports blocked when nothing is progressing', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      lockedPhases: [],
      tasks: [{ id: 'A001', status: 'blocked' }, reviewPending],
    });
    Vitest.expect(result.state).toBe('blocked');
  });

  Vitest.it('reports complete when status is complete and all tasks and phases are done', () => {
    const result = Lifecycle.analyze({
      status: 'complete',
      lockedPhases: ['A'],
      tasks: [done, reviewDone],
    });
    Vitest.expect(result.state).toBe('complete');
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.phases).toStrictEqual([
      { phase: 'A', locked: true, total: 2, complete: 2 },
    ]);
  });
});

Vitest.describe('Lifecycle.verify runtime', () => {
  Vitest.it('rejects complete with an unfinished task', () => {
    const result = Lifecycle.verify({
      status: 'complete',
      lockedPhases: ['A'],
      tasks: [pending, reviewDone],
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'status',
      message: "Feature status is 'complete' but 1 task is not complete: A001 (pending).",
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'locked-phases',
      message: "Phase 'A' is locked but task A001 (pending) is not complete.",
    });
  });

  Vitest.it('rejects complete with an unlocked phase', () => {
    const result = Lifecycle.verify({
      status: 'complete',
      lockedPhases: [],
      tasks: [done, reviewDone],
    });
    Vitest.expect(result.issues).toContainEqual({
      field: 'locked-phases',
      message: "Feature status is 'complete' but phase A is not locked.",
    });
  });

  Vitest.it('rejects all-done-but-in-progress bookkeeping', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      lockedPhases: ['A'],
      tasks: [done, reviewDone],
    });
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'status',
        message:
          "All tasks are complete and all phases are locked, but feature status is 'in-progress'.",
      },
    ]);
  });

  Vitest.it('rejects a locked phase with an unfinished task', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      lockedPhases: ['A'],
      tasks: [{ id: 'A001', status: 'in-progress' }],
    });
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'locked-phases',
        message: "Phase 'A' is locked but task A001 (in-progress) is not complete.",
      },
    ]);
  });

  Vitest.it('rejects forward locking when an earlier phase is unlocked', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      lockedPhases: ['B'],
      tasks: [
        { id: 'A001', status: 'complete' },
        { id: 'B001', status: 'complete' },
      ],
    });
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [
        { field: 'locked-phases', message: "Phase 'B' is locked but an earlier phase is not." },
      ],
    });
  });

  Vitest.it('accepts a consistent in-progress feature', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      lockedPhases: ['A'],
      tasks: [
        { id: 'A001', status: 'complete' },
        { id: 'B001', status: 'in-progress' },
      ],
    });
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });
});
