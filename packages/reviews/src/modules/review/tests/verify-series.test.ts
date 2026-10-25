import * as Vitest from '@effect/vitest';
import * as Review from '../index.js';

/** A valid ledger built from the renderer, so the two cannot drift. */
const validSeries = (): string =>
  Review.renderSeries({
    name: 'demo',
    target: 'the demo',
    created: '2026-10-12',
    rounds: [
      {
        round: '001',
        status: 'open',
        open: 1,
        inReview: 0,
        resolved: 0,
        wontFix: 0,
        escalated: 0,
      },
    ],
    findings: [
      { round: '001', id: 'F1', severity: 'Critical', status: 'Open', title: 'Null deref' },
    ],
  });

Vitest.describe('Review.verifySeriesFile', () => {
  Vitest.it('accepts a well-formed ledger', () => {
    Vitest.expect(Review.verifySeriesFile(validSeries())).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('reports a Rounds count that disagrees with the table', () => {
    const tampered = validSeries().replace('- Rounds: 1', '- Rounds: 2');
    Vitest.expect(Review.verifySeriesFile(tampered).valid).toBe(false);
  });

  Vitest.it('reports an unknown series Status', () => {
    const tampered = validSeries().replace('- Status: open', '- Status: paused');
    Vitest.expect(Review.verifySeriesFile(tampered).valid).toBe(false);
  });

  Vitest.it('reports a heading that is not a Review Series heading', () => {
    const tampered = validSeries().replace('# Review Series: demo', '# Review: demo');
    Vitest.expect(
      Review.verifySeriesFile(tampered).issues.some((found) => found.field === 'heading'),
    ).toBe(true);
  });
});

Vitest.describe('Review.parseSeries', () => {
  Vitest.it('reads metadata and both tables', () => {
    const parsed = Review.parseSeries(validSeries());
    Vitest.expect(parsed.metadata['Target']).toBe('the demo');
    Vitest.expect(parsed.rounds).toHaveLength(1);
    Vitest.expect(parsed.rounds[0]?.open).toBe(1);
    Vitest.expect(parsed.findings).toHaveLength(1);
    Vitest.expect(parsed.findings[0]?.id).toBe('F1');
  });
});

Vitest.describe('Review table renderers', () => {
  Vitest.it('renders an empty table as a header and separator only', () => {
    const lines = Review.renderFindingsTable([]).split('\n');
    Vitest.expect(lines).toHaveLength(2);
    Vitest.expect(lines[0]).toContain('| Round |');
  });

  Vitest.it('round-trips rows through the parser', () => {
    const text = Review.renderSeries({
      name: 'demo',
      target: 't',
      created: '2026-10-12',
      rounds: [
        {
          round: '001',
          status: 'closed',
          open: 0,
          inReview: 0,
          resolved: 2,
          wontFix: 1,
          escalated: 0,
        },
      ],
      findings: [],
    });
    const parsed = Review.parseSeries(text);
    Vitest.expect(parsed.rounds[0]?.resolved).toBe(2);
    Vitest.expect(parsed.rounds[0]?.wontFix).toBe(1);
  });
});
