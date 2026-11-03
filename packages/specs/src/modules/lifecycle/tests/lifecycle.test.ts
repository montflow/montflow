import * as Vitest from '@effect/vitest';
import * as Lifecycle from '../index.js';

const pending = { id: 'A001', status: 'pending' } as const;
const reviewPending = { id: 'A099', status: 'pending' } as const;
const done = { id: 'A001', status: 'complete' } as const;
const reviewDone = { id: 'A099', status: 'complete' } as const;

Vitest.describe('Lifecycle.analyze runtime', () => {
  Vitest.it('reports pending when nothing has moved off pending', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [pending, reviewPending],
    });
    Vitest.expect(result.state).toBe('pending');
    Vitest.expect(result.issues).toStrictEqual([]);
  });

  Vitest.it('reports pending when work has started but no run is active', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, reviewPending],
    });
    Vitest.expect(result.state).toBe('pending');
    Vitest.expect(result.counts).toStrictEqual({
      pending: 1,
      'in-progress': 0,
      complete: 1,
      blocked: 0,
    });
  });

  Vitest.it('reports in-progress when a live session is bound', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [pending, reviewPending],
      active: true,
    });
    Vitest.expect(result.state).toBe('in-progress');
  });

  Vitest.it('reports blocked when nothing is progressing', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [{ id: 'A001', status: 'blocked' }, reviewPending],
    });
    Vitest.expect(result.state).toBe('blocked');
  });

  Vitest.it('locks a phase only when every task is complete and a round passed', () => {
    const result = Lifecycle.analyze({
      status: 'complete',
      reviewedPhases: ['A'],
      waivedPhases: [],
      provenPhases: ['A'],
      tasks: [done, reviewDone],
      active: true,
    });
    Vitest.expect(result.state).toBe('complete');
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.phases).toStrictEqual([
      { phase: 'A', locked: true, total: 2, complete: 2 },
    ]);
  });

  Vitest.it('locks a complete phase with an effective waiver and proven gates', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: ['A'],
      provenPhases: ['A'],
      tasks: [done],
    });
    Vitest.expect(result.phases).toStrictEqual([
      { phase: 'A', locked: true, total: 1, complete: 1 },
    ]);
  });

  Vitest.it('keeps a complete phase unlocked when its gates are unproven', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: ['A'],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done],
    });
    Vitest.expect(result.phases).toStrictEqual([
      { phase: 'A', locked: false, total: 1, complete: 1 },
    ]);
  });

  Vitest.it('keeps a complete phase unlocked without a passed round', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, reviewDone, { id: 'B001', status: 'pending' }],
    });
    Vitest.expect(result.phases[0]).toStrictEqual({
      phase: 'A',
      locked: false,
      total: 2,
      complete: 2,
    });
    Vitest.expect(result.state).toBe('pending');
  });

  Vitest.it('never locks a phase that still has open work', () => {
    const result = Lifecycle.analyze({
      status: 'in-progress',
      reviewedPhases: ['A'],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, reviewPending],
    });
    Vitest.expect(result.phases).toStrictEqual([
      { phase: 'A', locked: false, total: 2, complete: 1 },
    ]);
  });
});

Vitest.describe('Lifecycle.verify runtime', () => {
  Vitest.it('rejects complete with an unfinished task', () => {
    const result = Lifecycle.verify({
      status: 'complete',
      reviewedPhases: ['A'],
      waivedPhases: [],
      provenPhases: [],
      tasks: [pending, reviewDone],
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toContainEqual({
      field: 'status',
      message: "Spec status is 'complete' but 1 task is not complete: A001 (pending).",
    });
  });

  Vitest.it('accepts a complete spec without any passed review round', () => {
    const result = Lifecycle.verify({
      status: 'complete',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, reviewDone],
    });
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('rejects all-done-but-in-progress bookkeeping', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, reviewDone],
    });
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [
        {
          field: 'status',
          message: "All tasks are complete, but spec status is 'in-progress'.",
        },
      ],
    });
  });

  Vitest.it('accepts a consistent in-progress spec across phases', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      reviewedPhases: ['A'],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, { id: 'B001', status: 'in-progress' }],
    });
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('rejects a complete v2 spec with an unlocked phase', () => {
    const result = Lifecycle.verify({
      status: 'complete',
      reviewedPhases: [],
      waivedPhases: [],
      provenPhases: ['A'],
      requireLocks: true,
      tasks: [done, reviewDone],
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain('1 phase is not locked');
  });

  Vitest.it('accepts a complete v2 spec whose every phase is locked', () => {
    const result = Lifecycle.verify({
      status: 'complete',
      reviewedPhases: ['A'],
      waivedPhases: [],
      provenPhases: ['A'],
      requireLocks: true,
      tasks: [done, reviewDone],
    });
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('does not require locks to be a prefix', () => {
    const result = Lifecycle.verify({
      status: 'in-progress',
      reviewedPhases: ['B'],
      waivedPhases: [],
      provenPhases: [],
      tasks: [done, { id: 'B001', status: 'pending' }],
    });
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });
});
