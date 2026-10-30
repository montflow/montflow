import * as Vitest from '@effect/vitest';
import * as Sizing from '../index.js';

Vitest.describe('Sizing.reviewCycles runtime', () => {
  Vitest.it('maps tiny to 1, small to 2, medium to 3, and large to 3', () => {
    Vitest.expect(Sizing.reviewCycles('tiny')).toBe(1);
    Vitest.expect(Sizing.reviewCycles('small')).toBe(2);
    Vitest.expect(Sizing.reviewCycles('medium')).toBe(3);
    Vitest.expect(Sizing.reviewCycles('large')).toBe(3);
  });

  Vitest.it('never exceeds the hard cap of 3 for any size', () => {
    for (const size of Sizing.SIZES) {
      Vitest.expect(Sizing.reviewCycles(size)).toBeLessThanOrEqual(Sizing.MAX_REVIEW_CYCLES);
    }
  });
});

Vitest.describe('Sizing.taskContribution runtime', () => {
  Vitest.it('gives a review task and an unsized task zero cycles', () => {
    Vitest.expect(Sizing.taskContribution({ type: 'review', size: 'large' })).toBe(0);
    Vitest.expect(Sizing.taskContribution({ type: 'review' })).toBe(0);
    Vitest.expect(Sizing.taskContribution({ type: 'execution' })).toBe(0);
  });

  Vitest.it('gives a sized non-review task its size budget', () => {
    Vitest.expect(Sizing.taskContribution({ type: 'execution', size: 'tiny' })).toBe(1);
    Vitest.expect(Sizing.taskContribution({ type: 'defect', size: 'small' })).toBe(2);
    Vitest.expect(Sizing.taskContribution({ type: 'execution', size: 'large' })).toBe(3);
  });

  Vitest.it('counts a bare size as a non-review task', () => {
    Vitest.expect(Sizing.taskContribution('tiny')).toBe(1);
    Vitest.expect(Sizing.taskContribution('medium')).toBe(3);
  });
});

Vitest.describe('Sizing.phaseReviewBudget runtime', () => {
  Vitest.it('takes the largest budget in a phase mixing tiny and medium', () => {
    const budget = Sizing.phaseReviewBudget([
      { type: 'execution', size: 'tiny' },
      { type: 'planning', size: 'medium' },
    ]);
    Vitest.expect(budget).toBe(3);
  });

  Vitest.it('gives a tiny-only phase exactly 1 cycle', () => {
    Vitest.expect(
      Sizing.phaseReviewBudget([
        { type: 'execution', size: 'tiny' },
        { type: 'exploratory', size: 'tiny' },
      ]),
    ).toBe(1);
  });

  Vitest.it('never lets the phase review task raise the budget', () => {
    const budget = Sizing.phaseReviewBudget([
      { type: 'execution', size: 'tiny' },
      { type: 'review', size: 'large' },
    ]);
    Vitest.expect(budget).toBe(1);
  });

  Vitest.it('caps every combination of sizes at 3', () => {
    for (const size of Sizing.SIZES) {
      for (const other of Sizing.SIZES) {
        Vitest.expect(
          Sizing.phaseReviewBudget([
            { type: 'execution', size },
            { type: 'defect', size: other },
          ]),
        ).toBeLessThanOrEqual(3);
      }
    }
  });

  Vitest.it('treats bare sizes as non-review tasks', () => {
    Vitest.expect(Sizing.phaseReviewBudget(['tiny', 'small'])).toBe(2);
  });

  Vitest.it('ignores a task that declares no size', () => {
    Vitest.expect(
      Sizing.phaseReviewBudget([{ type: 'execution', size: 'tiny' }, { type: 'execution' }]),
    ).toBe(1);
  });

  Vitest.it('floors a review-only phase at 1 cycle', () => {
    Vitest.expect(Sizing.phaseReviewBudget([{ type: 'review' }])).toBe(1);
  });

  Vitest.it('floors an unsized non-review task plus its review task at 1 cycle', () => {
    Vitest.expect(
      Sizing.phaseReviewBudget([{ type: 'execution' }, { type: 'review', size: 'small' }]),
    ).toBe(1);
  });

  Vitest.it('scores an empty phase at zero cycles', () => {
    Vitest.expect(Sizing.phaseReviewBudget([])).toBe(0);
  });
});
