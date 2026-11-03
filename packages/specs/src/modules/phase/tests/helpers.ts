/** PHASE.md fixture builder for the phase module tests. */

export interface PhaseFixture {
  readonly id?: string;
  readonly objective?: string;
  readonly status?: string;
  readonly review?: string;
  readonly reviewReason?: string;
  readonly reviewEvidence?: string;
  readonly gate?: string;
  readonly title?: string;
}

/** Build a PHASE.md body with valid defaults and optional overrides. */
export const phaseMarkdown = (fixture: PhaseFixture = {}): string => {
  const id = fixture.id ?? 'A';
  const review = fixture.review ?? 'required';
  return [
    '---',
    `id: ${id}`,
    `objective: ${fixture.objective ?? 'Deliver the phase objective.'}`,
    `status: ${fixture.status ?? 'pending'}`,
    `review: ${review}`,
    ...(review === 'waived'
      ? [
          `review-reason: ${fixture.reviewReason ?? 'Every task gate is the review evidence.'}`,
          ...(fixture.reviewEvidence === undefined
            ? []
            : [`review-evidence: ${fixture.reviewEvidence}`]),
        ]
      : []),
    `gate: ${fixture.gate ?? 'none'}`,
    '---',
    '',
    fixture.title ?? `# Phase ${id}`,
    '',
    '## Notes',
    '',
    'None.',
    '',
  ].join('\n');
};

/** A classified phase gate with one mechanical stage. */
export const mechanicalPhaseGate = (stage = 0): string =>
  [`## Stage ${stage}: Verify the phase (mechanical)`, '', '- [ ] Suite passes.', ''].join('\n');

/** One passing result line for a stage. */
export const passingResult = (stage = 0): string =>
  JSON.stringify({
    stage,
    title: 'Verify the phase',
    kind: 'mechanical',
    command: 'bun run test',
    exit: 0,
    verdict: 'pass',
    at: '2026-01-01T00:00:00Z',
    output: '',
  });
