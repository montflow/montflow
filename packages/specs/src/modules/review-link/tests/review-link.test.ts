import * as Vitest from '@effect/vitest';
import * as ReviewLink from '../index.js';

const task = (id: string, type = 'execution') => ({ id, type });

/** A review-task entry, complete by default. */
const reviewTask = (id: string, profiles: ReadonlyArray<string> = [], complete = true) => ({
  phase: id.replace(/\d+$/, ''),
  profiles,
  complete,
});

/** A series snapshot from `[round, phase?]` pairs. */
const series = (name: string, rounds: ReadonlyArray<readonly [string, string?]>) => ({
  name,
  rounds: rounds.map(([round, phase]) => (phase === undefined ? { round } : { round, phase })),
});

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

Vitest.describe('ReviewLink.profileSeriesName', () => {
  Vitest.it('joins the spec name and profile with one hyphen', () => {
    Vitest.expect(ReviewLink.profileSeriesName('ship-login', 'example-reviewer')).toBe(
      'ship-login-example-reviewer',
    );
  });
});

Vitest.describe('ReviewLink.seriesNames', () => {
  Vitest.it('puts the default series first, then profiles in declared order', () => {
    Vitest.expect(
      ReviewLink.seriesNames('ship-login', ['example-reviewer', 'generic-reviewer']),
    ).toStrictEqual(['ship-login', 'ship-login-example-reviewer', 'ship-login-generic-reviewer']);
  });

  Vitest.it('returns only the default series with no profiles', () => {
    Vitest.expect(ReviewLink.seriesNames('ship-login', [])).toStrictEqual(['ship-login']);
  });

  Vitest.it('derives valid, collision-free slugs within one spec', () => {
    const names = ReviewLink.seriesNames('billing-v2', ['example-reviewer', 'security']);
    Vitest.expect(names.every((name) => SLUG.test(name))).toBe(true);
    Vitest.expect(new Set(names).size).toBe(names.length);
  });

  Vitest.it('accepts the documented cross-spec collision, resolved by the spec name', () => {
    // spec `foo` + profile `bar` composes `foo-bar`, also the default of spec `foo-bar`.
    Vitest.expect(ReviewLink.profileSeriesName('foo', 'bar')).toBe(
      ReviewLink.seriesName('foo-bar'),
    );
    const attributed = [series('foo', [['001', 'A']]), series('foo-bar', [['001', 'A']])];
    Vitest.expect(
      ReviewLink.verify('foo', [reviewTask('A099', ['bar'])], attributed),
    ).toStrictEqual({ valid: true, issues: [] });
    Vitest.expect(ReviewLink.verify('foo-bar', [reviewTask('A099')], attributed)).toStrictEqual({
      valid: true,
      issues: [],
    });
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
  Vitest.it('accepts a no-profile spec whose complete review is attributed in its series', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099')],
      [series('ship-login', [['001', 'A']])],
    );
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('requires no round for a pending review phase', () => {
    const result = ReviewLink.verify('ship-login', [reviewTask('A099', [], false)], []);
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('flags a complete phase with no attributed round in the default series', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099')],
      [series('ship-login', [])],
    );
    Vitest.expect(result).toStrictEqual({
      valid: false,
      issues: [
        {
          field: 'review-series',
          message:
            "Phase 'A' has a review task but series 'ship-login' has no round attributed to phase 'A'.",
        },
      ],
    });
  });

  Vitest.it('does not let a round with no Phase satisfy a complete phase', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099')],
      [series('ship-login', [['001']])],
    );
    Vitest.expect(result.valid).toBe(false);
  });

  Vitest.it('flags an absent series as not existing', () => {
    const result = ReviewLink.verify('ship-login', [reviewTask('A099')], []);
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'review-series',
        message: "Phase 'A' has a review task but review series 'ship-login' does not exist.",
      },
    ]);
  });

  Vitest.it('requires the attributed round in every expected series (one extra profile)', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099', ['example-reviewer'])],
      [series('ship-login', [['001', 'A']])],
    );
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'review-series',
        message:
          "Phase 'A' has a review task but review series 'ship-login-example-reviewer' does not exist.",
      },
    ]);
  });

  Vitest.it('passes when one extra profile is attributed in both series', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099', ['example-reviewer'])],
      [series('ship-login', [['001', 'A']]), series('ship-login-example-reviewer', [['001', 'A']])],
    );
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('raises one issue per missing series with two extra profiles', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099', ['example-reviewer', 'security'])],
      [series('ship-login', [['001', 'A']]), series('ship-login-example-reviewer', [['001', 'A']])],
    );
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'review-series',
        message:
          "Phase 'A' has a review task but review series 'ship-login-security' does not exist.",
      },
    ]);
  });

  Vitest.it('flags one series without the attributed round', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099', ['example-reviewer'])],
      [series('ship-login', [['001', 'A']]), series('ship-login-example-reviewer', [['001', 'B']])],
    );
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'review-series',
        message:
          "Phase 'A' has a review task but series 'ship-login-example-reviewer' has no round attributed to phase 'A'.",
      },
    ]);
  });

  Vitest.it('flags attributed round numbers that disagree across series', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099', ['example-reviewer'])],
      [series('ship-login', [['001', 'A']]), series('ship-login-example-reviewer', [['002', 'A']])],
    );
    Vitest.expect(result.issues).toStrictEqual([
      {
        field: 'review-series',
        message:
          "Phase 'A' is reviewed at round 001 in 'ship-login' but round 002 in 'ship-login-example-reviewer'.",
      },
    ]);
  });

  Vitest.it('ignores a supplied series outside the expected set', () => {
    const result = ReviewLink.verify(
      'ship-login',
      [reviewTask('A099')],
      [series('ship-login', [['001', 'A']]), series('other-spec', [['009', 'A']])],
    );
    Vitest.expect(result).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('accepts a spec with no review tasks', () => {
    Vitest.expect(ReviewLink.verify('ship-login', [], [])).toStrictEqual({
      valid: true,
      issues: [],
    });
  });
});

/** A round file with the given `## Metadata` lines. */
const roundWith = (metadata: ReadonlyArray<string>): string =>
  ['# Review: ship-login / 001', '', '## Metadata', '', ...metadata, '', '## Findings', ''].join(
    '\n',
  );

Vitest.describe('ReviewLink.roundPhase', () => {
  Vitest.it('reads the phase from the Metadata section', () => {
    Vitest.expect(ReviewLink.roundPhase(roundWith(['- Round: 001', '- Phase: E']))).toBe('E');
  });

  Vitest.it('returns undefined without an attribution or outside Metadata', () => {
    Vitest.expect(ReviewLink.roundPhase(roundWith(['- Round: 001']))).toBeUndefined();
    Vitest.expect(
      ReviewLink.roundPhase(['# Review', '', '## Findings', '', '- Phase: A', ''].join('\n')),
    ).toBeUndefined();
  });

  Vitest.it('rejects a lowercased, decorated, or annotated attribution', () => {
    for (const line of ['- Phase: a', '- Phase: **E**', '- Phase: E (locked)', '- Phase: ..']) {
      Vitest.expect(ReviewLink.roundPhase(roundWith(['- Round: 001', line])), line).toBeUndefined();
    }
  });
});

Vitest.describe('ReviewLink.verifyBudgets', () => {
  const tinyPhase = [{ phase: 'A', budget: 1 }];

  Vitest.it('accepts a series exactly at the phase budget', () => {
    Vitest.expect(
      ReviewLink.verifyBudgets(['ship-login'], tinyPhase, [series('ship-login', [['001', 'A']])]),
    ).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('fails a series one round over the phase budget, naming the count', () => {
    const result = ReviewLink.verifyBudgets(['ship-login'], tinyPhase, [
      series('ship-login', [
        ['001', 'A'],
        ['002', 'A'],
      ]),
    ]);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      {
        code: 'review.budget-exceeded',
        field: 'review-series',
        message:
          "Review series 'ship-login' holds 2 rounds attributed to phase 'A'; the phase budget is 1.",
        expected: "at most 1 round for phase 'A'",
        actual: '2 rounds',
        fix: "Record the escalation in phase 'A' review task's MEMORY.md and ask the user; no further round may be opened in series 'ship-login'. The budget is the largest non-review task size in phase 'A'.",
      },
    ]);
  });

  Vitest.it('fails a series over the phase budget, naming series, phase, budget, and count', () => {
    const result = ReviewLink.verifyBudgets(['ship-login'], tinyPhase, [
      series('ship-login', [
        ['001', 'A'],
        ['002', 'A'],
        ['003', 'A'],
        ['004', 'A'],
      ]),
    ]);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues).toStrictEqual([
      {
        code: 'review.budget-exceeded',
        field: 'review-series',
        message:
          "Review series 'ship-login' holds 4 rounds attributed to phase 'A'; the phase budget is 1.",
        expected: "at most 1 round for phase 'A'",
        actual: '4 rounds',
        fix: "Record the escalation in phase 'A' review task's MEMORY.md and ask the user; no further round may be opened in series 'ship-login'. The budget is the largest non-review task size in phase 'A'.",
      },
    ]);
  });

  Vitest.it('counts only rounds attributed to the phase, in expected series', () => {
    const phases = [
      { phase: 'A', budget: 1 },
      { phase: 'B', budget: 3 },
    ];
    const rounds = [
      series('ship-login', [
        ['001', 'A'],
        ['002', 'B'],
        ['003', 'B'],
        ['004', 'B'],
      ]),
      series('other-spec', [
        ['001', 'A'],
        ['002', 'A'],
      ]),
    ];
    Vitest.expect(ReviewLink.verifyBudgets(['ship-login'], phases, rounds)).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('warns for a round with no phase attribution instead of exempting it', () => {
    const result = ReviewLink.verifyBudgets(['ship-login'], tinyPhase, [
      series('ship-login', [['001', 'A'], ['002'], ['003'], ['004']]),
    ]);
    // The attributed round is at budget; the three unattributed ones are not
    // errors but are never silent either.
    Vitest.expect(result.valid).toBe(true);
    Vitest.expect(result.issues).toStrictEqual([
      {
        code: 'review.phase-unattributed',
        field: 'review-series',
        severity: 'warning',
        message:
          "Review series 'ship-login' round '002' has no phase attribution, so it counts toward no phase budget.",
        expected: "a '- Phase: <id>' line in the round's Metadata",
        actual: 'no attribution',
        fix: "Add '- Phase: <id>' to the '## Metadata' section of 'ship-login/002/REVIEW.md', or the round stays outside every phase budget.",
      },
      {
        code: 'review.phase-unattributed',
        field: 'review-series',
        severity: 'warning',
        message:
          "Review series 'ship-login' round '003' has no phase attribution, so it counts toward no phase budget.",
        expected: "a '- Phase: <id>' line in the round's Metadata",
        actual: 'no attribution',
        fix: "Add '- Phase: <id>' to the '## Metadata' section of 'ship-login/003/REVIEW.md', or the round stays outside every phase budget.",
      },
      {
        code: 'review.phase-unattributed',
        field: 'review-series',
        severity: 'warning',
        message:
          "Review series 'ship-login' round '004' has no phase attribution, so it counts toward no phase budget.",
        expected: "a '- Phase: <id>' line in the round's Metadata",
        actual: 'no attribution',
        fix: "Add '- Phase: <id>' to the '## Metadata' section of 'ship-login/004/REVIEW.md', or the round stays outside every phase budget.",
      },
    ]);
  });

  Vitest.it('ignores an unattributed round in a series the spec does not own', () => {
    Vitest.expect(
      ReviewLink.verifyBudgets(['ship-login'], tinyPhase, [series('other-spec', [['001']])]),
    ).toStrictEqual({ valid: true, issues: [] });
  });

  Vitest.it('skips a phase with no budget entry and a series that does not exist', () => {
    Vitest.expect(
      ReviewLink.verifyBudgets([], tinyPhase, [series('ship-login', [['001', 'A']])]),
    ).toStrictEqual({ valid: true, issues: [] });
    Vitest.expect(
      ReviewLink.verifyBudgets(['ship-login'], [], [series('ship-login', [['001', 'A']])]),
    ).toStrictEqual({ valid: true, issues: [] });
  });
});
