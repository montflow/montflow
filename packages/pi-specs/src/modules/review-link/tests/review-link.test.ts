import * as Vitest from '@effect/vitest';
import * as ReviewLink from '../index.js';

const task = (id: string, type = 'execution') => ({ id, type });

Vitest.describe('ReviewLink.roundForPhase', () => {
  Vitest.it('maps a phase to its zero-padded rank', () => {
    Vitest.expect(ReviewLink.roundForPhase('A')).toBe('001');
    Vitest.expect(ReviewLink.roundForPhase('B')).toBe('002');
    Vitest.expect(ReviewLink.roundForPhase('Z')).toBe('026');
    Vitest.expect(ReviewLink.roundForPhase('AA')).toBe('027');
  });
});

Vitest.describe('ReviewLink.seriesName', () => {
  Vitest.it('is the spec name by convention', () => {
    Vitest.expect(ReviewLink.seriesName('ship-login')).toBe('ship-login');
  });
});

Vitest.describe('ReviewLink.reviewPhases', () => {
  Vitest.it('collects the phases holding a review task, phase-sorted', () => {
    const phases = ReviewLink.reviewPhases([
      task('B001'),
      task('B099', 'review'),
      task('A001'),
      task('A099', 'review'),
    ]);
    Vitest.expect(phases).toStrictEqual(['A', 'B']);
  });

  Vitest.it('is empty when no task is a review', () => {
    Vitest.expect(ReviewLink.reviewPhases([task('A001')])).toStrictEqual([]);
  });
});

Vitest.describe('ReviewLink.verify', () => {
  Vitest.it('accepts a series with a round per review phase', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [task('A001'), task('A099', 'review'), task('B099', 'review')],
      { name: 'ship-login', rounds: ['001', '002'] },
    );
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('accepts a spec with no review tasks', () => {
    Vitest.expect(ReviewLink.verify('ship-login', [task('A001')], undefined)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('flags a review phase whose round is missing', () => {
    const result = ReviewLink.verify('ship-login', [task('A099', 'review')], {
      name: 'ship-login',
      rounds: [],
    });
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'phase A',
        message: "Phase 'A' has a review task but series 'ship-login' has no round 001.",
      },
    ]);
  });

  Vitest.it('flags an absent series as every review round missing', () => {
    const result = ReviewLink.verify('ship-login', [task('A099', 'review')], undefined);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues[0]?.message).toContain('does not exist');
  });

  Vitest.it('flags a series named against the convention', () => {
    const result = ReviewLink.verify('ship-login', [], {
      name: 'other-name',
      rounds: [],
    });
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'review-series',
        message: "Review series is 'other-name' but the convention names it 'ship-login'.",
      },
    ]);
  });
});
