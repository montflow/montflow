import * as Vitest from '@effect/vitest';
import * as ReviewPolicy from '../index.js';
import type { RoundFinding, SeriesSnapshot } from '../../review-link/index.js';

const finding = (id: string, severity: string, status = 'Open'): RoundFinding => ({
  id,
  severity,
  status,
});

interface RoundFixture {
  readonly round: string;
  readonly phase?: string | undefined;
  readonly findings?: ReadonlyArray<RoundFinding> | undefined;
}

interface RoundSnapshotFixture {
  round: string;
  phase?: string;
  findings?: ReadonlyArray<RoundFinding>;
}

const round = (fixture: RoundFixture): RoundSnapshotFixture => {
  const built: RoundSnapshotFixture = { round: fixture.round };
  if (fixture.phase !== undefined) built.phase = fixture.phase;
  if (fixture.findings !== undefined) built.findings = fixture.findings;
  return built;
};

const series = (name: string, rounds: ReadonlyArray<ReturnType<typeof round>>) => ({
  name,
  rounds,
});

interface Case {
  readonly name: string;
  readonly budget: number;
  readonly mode: 'guided' | 'autonomous';
  readonly waived?: boolean;
  readonly profiles?: ReadonlyArray<string>;
  readonly series: ReadonlyArray<ReturnType<typeof series>>;
  readonly decision: ReviewPolicy.ReviewDecision;
  readonly reason: string;
  readonly rounds?: number;
}

const cases: ReadonlyArray<Case> = [
  {
    name: 'an effective waiver wins before any round is read',
    budget: 3,
    mode: 'guided',
    waived: true,
    series: [series('ship-login', [])],
    decision: 'waived',
    reason: 'review.waived',
  },
  {
    name: 'an empty series starts the first round',
    budget: 3,
    mode: 'guided',
    series: [series('ship-login', [])],
    decision: 'start',
    reason: 'review.round-missing',
  },
  {
    name: 'a round attributed to another phase does not count',
    budget: 3,
    mode: 'guided',
    series: [series('ship-login', [round({ round: '001', phase: 'B' })])],
    decision: 'start',
    reason: 'review.round-missing',
  },
  {
    name: 'a round with no phase attribution escalates once the phase has a round',
    budget: 3,
    mode: 'guided',
    series: [series('ship-login', [round({ round: '001', phase: 'A' }), round({ round: '002' })])],
    decision: 'escalate',
    reason: 'review.phase-unattributed',
  },
  {
    name: 'zero open findings pass',
    budget: 3,
    mode: 'guided',
    series: [
      series('ship-login', [
        round({
          round: '001',
          phase: 'A',
          findings: [finding('F1', 'Major', 'Resolved'), finding('F2', 'Minor', "Won't Fix")],
        }),
      ]),
    ],
    decision: 'pass',
    reason: 'review.clean',
  },
  {
    name: 'a Minor/Nit-only round stops the cycle regardless of remaining budget',
    budget: 3,
    mode: 'guided',
    series: [
      series('ship-login', [
        round({
          round: '001',
          phase: 'A',
          findings: [finding('F1', 'Minor'), finding('F2', 'Nit')],
        }),
      ]),
    ],
    decision: 'fix-and-stop',
    reason: 'review.minor-only',
  },
  {
    name: 'a Major with budget remaining reworks at budget 2',
    budget: 2,
    mode: 'guided',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'rework',
    reason: 'review.budget-remaining',
    rounds: 1,
  },
  {
    name: 'a Critical with budget remaining reworks at budget 3',
    budget: 3,
    mode: 'guided',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Critical')] }),
        round({ round: '002', phase: 'A', findings: [finding('F1', 'Critical')] }),
      ]),
    ],
    decision: 'rework',
    reason: 'review.budget-remaining',
    rounds: 2,
  },
  {
    name: 'guided escalates at the cap at budget 1',
    budget: 1,
    mode: 'guided',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'escalate',
    reason: 'review.escalate-cap',
    rounds: 1,
  },
  {
    name: 'autonomous may overflow once at budget 1',
    budget: 1,
    mode: 'autonomous',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'overflow',
    reason: 'review.overflow-eligible',
    rounds: 1,
  },
  {
    name: 'autonomous may overflow once at budget 3',
    budget: 3,
    mode: 'autonomous',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
        round({ round: '002', phase: 'A', findings: [finding('F1', 'Major')] }),
        round({ round: '003', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'overflow',
    reason: 'review.overflow-eligible',
    rounds: 3,
  },
  {
    name: 'the second autonomous overflow is exhausted at budget 2',
    budget: 2,
    mode: 'autonomous',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
        round({ round: '002', phase: 'A', findings: [finding('F1', 'Major')] }),
        round({ round: '003', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'escalate',
    reason: 'review.overflow-exhausted',
    rounds: 3,
  },
  {
    name: 'autonomous past budget + 1 is exhausted at budget 1',
    budget: 1,
    mode: 'autonomous',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
        round({ round: '002', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'escalate',
    reason: 'review.overflow-exhausted',
    rounds: 2,
  },
  {
    name: 'an unparsable severity escalates instead of reading as Minor',
    budget: 3,
    mode: 'guided',
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'High')] }),
      ]),
    ],
    decision: 'escalate',
    reason: 'review.severity-unparsable',
  },
  {
    name: 'an empty severity escalates instead of reading as Minor',
    budget: 3,
    mode: 'guided',
    series: [
      series('ship-login', [round({ round: '001', phase: 'A', findings: [finding('F1', '')] })]),
    ],
    decision: 'escalate',
    reason: 'review.severity-unparsable',
  },
  {
    name: 'a missing profile series starts even when the default series passed',
    budget: 3,
    mode: 'guided',
    profiles: ['example-reviewer'],
    series: [series('ship-login', [round({ round: '001', phase: 'A' })])],
    decision: 'start',
    reason: 'review.round-missing',
  },
  {
    name: 'the strictest series wins: Minor-only does not mask another series rework',
    budget: 3,
    mode: 'guided',
    profiles: ['example-reviewer'],
    series: [
      series('ship-login', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Minor')] }),
      ]),
      series('ship-login-example-reviewer', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'rework',
    reason: 'review.budget-remaining',
  },
  {
    name: 'the strictest series wins: a profile escalation beats a clean default series',
    budget: 3,
    mode: 'guided',
    profiles: ['example-reviewer'],
    series: [
      series('ship-login', [round({ round: '001', phase: 'A' })]),
      series('ship-login-example-reviewer', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'High')] }),
      ]),
    ],
    decision: 'escalate',
    reason: 'review.severity-unparsable',
  },
  {
    name: 'the strictest series wins: autonomous overflow beats a clean series',
    budget: 2,
    mode: 'autonomous',
    profiles: ['example-reviewer'],
    series: [
      series('ship-login', [round({ round: '001', phase: 'A' })]),
      series('ship-login-example-reviewer', [
        round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
        round({ round: '002', phase: 'A', findings: [finding('F1', 'Major')] }),
      ]),
    ],
    decision: 'overflow',
    reason: 'review.overflow-eligible',
  },
];

Vitest.describe('ReviewPolicy.decide matrix', () => {
  for (const testCase of cases) {
    Vitest.it(testCase.name, () => {
      const report = ReviewPolicy.decide({
        name: 'ship-login',
        phase: 'A',
        mode: testCase.mode,
        budget: testCase.budget,
        waived: testCase.waived ?? false,
        profiles: testCase.profiles ?? [],
        series: testCase.series,
      });
      Vitest.expect({
        decision: report.decision,
        reason: report.reason,
      }).toStrictEqual({ decision: testCase.decision, reason: testCase.reason });
      if (testCase.rounds !== undefined) Vitest.expect(report.rounds).toBe(testCase.rounds);
      Vitest.expect(report.budget).toBe(testCase.budget);
    });
  }
});

Vitest.describe('ReviewPolicy.decide breakdown', () => {
  Vitest.it('names every expected series in declared order', () => {
    const report = ReviewPolicy.decide({
      name: 'ship-login',
      phase: 'A',
      mode: 'guided',
      budget: 2,
      waived: false,
      profiles: ['example-reviewer', 'security'],
      series: [
        series('ship-login', [
          round({ round: '001', phase: 'A', findings: [finding('F1', 'Minor')] }),
        ]),
        series('ship-login-example-reviewer', [round({ round: '001', phase: 'A' })]),
        series('ship-login-security', [
          round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
        ]),
      ],
    });
    Vitest.expect(report.series.map((entry) => entry.series)).toStrictEqual([
      'ship-login',
      'ship-login-example-reviewer',
      'ship-login-security',
    ]);
    Vitest.expect(report.series.map((entry) => entry.decision)).toStrictEqual([
      'fix-and-stop',
      'pass',
      'rework',
    ]);
  });

  Vitest.it('aggregates open findings across the latest round of each series', () => {
    const report = ReviewPolicy.decide({
      name: 'ship-login',
      phase: 'A',
      mode: 'guided',
      budget: 3,
      waived: false,
      profiles: ['example-reviewer'],
      series: [
        series('ship-login', [
          round({
            round: '001',
            phase: 'A',
            findings: [finding('F1', 'Major'), finding('F2', 'Nit'), finding('F3', 'Minor')],
          }),
        ]),
        series('ship-login-example-reviewer', [
          round({
            round: '001',
            phase: 'A',
            findings: [finding('F1', 'Critical'), finding('F2', 'Minor', 'Resolved')],
          }),
        ]),
      ],
    });
    Vitest.expect(report.open).toStrictEqual({ critical: 1, major: 1, minor: 1, nit: 1 });
    Vitest.expect(report.rounds).toBe(1);
  });

  Vitest.it('reads only the latest attributed round, not an older pass', () => {
    const report = ReviewPolicy.decide({
      name: 'ship-login',
      phase: 'A',
      mode: 'guided',
      budget: 3,
      waived: false,
      profiles: [],
      series: [
        series('ship-login', [
          round({ round: '001', phase: 'A', findings: [finding('F1', 'Critical')] }),
          round({ round: '002', phase: 'A', findings: [finding('F1', 'Minor')] }),
        ]),
      ],
    });
    Vitest.expect(report.decision).toBe('fix-and-stop');
    Vitest.expect(report.open).toStrictEqual({ critical: 0, major: 0, minor: 1, nit: 0 });
  });

  Vitest.it('renders the four contract fields and the per-series breakdown', () => {
    const report = ReviewPolicy.decide({
      name: 'ship-login',
      phase: 'A',
      mode: 'autonomous',
      budget: 1,
      waived: false,
      profiles: [],
      series: [
        series('ship-login', [
          round({ round: '001', phase: 'A', findings: [finding('F1', 'Major')] }),
        ]),
      ],
    });
    const text = ReviewPolicy.renderDecision(report);
    Vitest.expect(text).toContain('decision overflow');
    Vitest.expect(text).toContain('rounds 1/1');
    Vitest.expect(text).toContain('open 1 (critical 0, major 1, minor 0, nit 0)');
    Vitest.expect(text).toContain('reason review.overflow-eligible');
    Vitest.expect(text).toContain('series ship-login: decision overflow');
  });

  Vitest.it('renders JSON with the same decision and breakdown', () => {
    const report = ReviewPolicy.decide({
      name: 'ship-login',
      phase: 'A',
      mode: 'guided',
      budget: 2,
      waived: false,
      profiles: [],
      series: [series('ship-login', [round({ round: '001', phase: 'A' })])],
    });
    // SAFETY: renderDecisionJson serialises the ReviewDecisionReport built
    // immediately above, so the parsed document is that same contract.
    const parsed = JSON.parse(ReviewPolicy.renderDecisionJson(report)) as typeof report;
    Vitest.expect(parsed.decision).toBe('pass');
    Vitest.expect(parsed.reason).toBe('review.clean');
    Vitest.expect(parsed.rounds).toBe(1);
    Vitest.expect(parsed.budget).toBe(2);
    Vitest.expect(parsed.series).toHaveLength(1);
  });
});

const phase = (budget = 3): ReviewPolicy.PhaseReviewInput => ({
  phase: 'A',
  profiles: [],
  budget,
  waived: false,
});

const snapshot = (
  name: string,
  rounds: ReadonlyArray<SeriesSnapshot['rounds'][number]>,
): SeriesSnapshot => ({ name, rounds });

Vitest.describe('ReviewPolicy.reviewVerdict', () => {
  Vitest.it('rejects an open round even when it has no findings', () => {
    const verdict = ReviewPolicy.reviewVerdict('ship-login', phase(), [
      snapshot('ship-login', [{ round: '001', phase: 'A', passed: false, findings: [] }]),
    ]);
    Vitest.expect(verdict.passed).toBe(false);
    Vitest.expect(verdict.decision).toBe('pass');
  });

  Vitest.it('accepts a closed round with terminal findings', () => {
    const verdict = ReviewPolicy.reviewVerdict('ship-login', phase(), [
      snapshot('ship-login', [
        { round: '001', phase: 'A', passed: true, findings: [finding('F1', 'Major', 'Resolved')] },
      ]),
    ]);
    Vitest.expect(verdict.passed).toBe(true);
  });

  Vitest.it('rejects a closed round that still holds an open Critical', () => {
    const verdict = ReviewPolicy.reviewVerdict('ship-login', phase(), [
      snapshot('ship-login', [
        { round: '001', phase: 'A', passed: true, findings: [finding('F1', 'Critical', 'Open')] },
      ]),
    ]);
    Vitest.expect(verdict.passed).toBe(false);
    Vitest.expect(verdict.decision).toBe('rework');
  });

  Vitest.it('rejects when a declared profile series is missing or open', () => {
    const verdict = ReviewPolicy.reviewVerdict(
      'ship-login',
      { ...phase(), profiles: ['security'] },
      [
        snapshot('ship-login', [{ round: '001', phase: 'A', passed: true, findings: [] }]),
        snapshot('ship-login-security', [
          { round: '001', phase: 'A', passed: true, findings: [finding('F1', 'Major', 'Open')] },
        ]),
      ],
    );
    Vitest.expect(verdict.passed).toBe(false);
    Vitest.expect(verdict.decision).toBe('rework');
  });

  Vitest.it('accepts a valid minor-deferred closure whose deferred finding is terminal', () => {
    const verdict = ReviewPolicy.reviewVerdict('ship-login', phase(1), [
      snapshot('ship-login', [
        {
          round: '001',
          phase: 'A',
          passed: true,
          findings: [finding('F1', 'Minor', "Won't Fix")],
          deferral: {
            disposition: 'minor-deferred',
            deferred: ['F1'],
            missing: [],
            severities: ['Minor'],
            invalidIds: [],
            severityInvalid: false,
            valid: true,
          },
        },
      ]),
    ]);
    Vitest.expect(verdict.passed).toBe(true);
  });

  Vitest.it('rejects a minor-deferred closure whose deferred Minor is still open', () => {
    const verdict = ReviewPolicy.reviewVerdict('ship-login', phase(1), [
      snapshot('ship-login', [
        {
          round: '001',
          phase: 'A',
          passed: true,
          findings: [finding('F1', 'Minor', 'Open')],
          deferral: {
            disposition: 'minor-deferred',
            deferred: ['F1'],
            missing: [],
            severities: ['Minor'],
            invalidIds: [],
            severityInvalid: false,
            valid: true,
          },
        },
      ]),
    ]);
    Vitest.expect(verdict.passed).toBe(false);
    Vitest.expect(verdict.decision).toBe('fix-and-stop');
  });

  Vitest.it('reviewDecisionPassed accepts an open round with terminal findings', () => {
    const verdict = ReviewPolicy.reviewDecisionPassed('ship-login', phase(), [
      snapshot('ship-login', [
        {
          round: '001',
          phase: 'A',
          passed: false,
          findings: [finding('F1', 'Major', 'Resolved')],
        },
      ]),
    ]);
    Vitest.expect(verdict.passed).toBe(true);
    Vitest.expect(verdict.decision).toBe('pass');
  });

  Vitest.it('accepts an effective waiver with no round', () => {
    const verdict = ReviewPolicy.reviewVerdict('ship-login', { ...phase(), waived: true }, [
      snapshot('ship-login', []),
    ]);
    Vitest.expect(verdict.passed).toBe(true);
    Vitest.expect(verdict.decision).toBe('waived');
  });
});
