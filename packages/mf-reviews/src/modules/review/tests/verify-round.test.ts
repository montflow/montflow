import * as Vitest from '@effect/vitest';
import * as Review from '../index.js';

/** A valid round file with one Critical finding. */
const validRound = (): string =>
  [
    '# Review: demo / 001',
    '',
    '## Metadata',
    '- Target: the demo',
    '- Round: 001',
    '- Type: standalone',
    '- Isolation: isolated',
    '- Max Attempts: 3',
    '- Status: open',
    '- Created: 2026-10-12',
    '',
    '## Findings',
    '',
    '### F1 — Null deref in parse',
    '- Severity: Critical',
    '- Location: `src/parse.ts:42`',
    '- Status: Open',
    '- Attempts: 0',
    '- First Seen: 001',
    '- Problem: parse returns undefined and the caller derefs it.',
    '- Impact: crash on empty input.',
    '- Suggestion: guard the return.',
    '',
    '#### Discussion',
    '',
    '## Summary',
    '- Critical: 1',
    '- Major: 0',
    '- Minor: 0',
    '- Nit: 0',
    '- Open: 1',
    '- In Review: 0',
    '- Resolved: 0',
    "- Won't Fix: 0",
    '- Escalated: 0',
    '',
  ].join('\n');

Vitest.describe('Review.verifyRoundFile', () => {
  Vitest.it('accepts a well-formed round', () => {
    Vitest.expect(Review.verifyRoundFile('001', validRound())).toStrictEqual({
      valid: true,
      issues: [],
    });
  });

  Vitest.it('accepts the scaffold renderRound writes', () => {
    const text = Review.renderRound({
      name: 'demo',
      round: '001',
      target: 'the demo',
      created: '2026-10-12',
    });
    Vitest.expect(Review.verifyRoundFile('001', text).valid).toBe(true);
  });

  Vitest.it('reports a Summary count that disagrees with the findings', () => {
    const tampered = validRound().replace('- Open: 1', '- Open: 2');
    const result = Review.verifyRoundFile('001', tampered);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.some((found) => found.field === 'summary')).toBe(true);
  });

  Vitest.it('reports a finding with no Discussion subsection', () => {
    const tampered = validRound().replace('#### Discussion\n', '');
    const result = Review.verifyRoundFile('001', tampered);
    Vitest.expect(result.issues.some((found) => found.message.includes('Discussion'))).toBe(true);
  });

  Vitest.it('reports a Round that disagrees with the directory', () => {
    const result = Review.verifyRoundFile('002', validRound());
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.some((found) => found.message.includes("directory is '002'"))).toBe(
      true,
    );
  });

  Vitest.it('reports an unknown Severity', () => {
    const tampered = validRound().replace('- Severity: Critical', '- Severity: Blocker');
    Vitest.expect(
      Review.verifyRoundFile('001', tampered).issues.some((found) =>
        found.message.includes('Severity'),
      ),
    ).toBe(true);
  });

  Vitest.it('reports an empty Findings section', () => {
    const text = Review.renderRound({
      name: 'demo',
      round: '001',
      target: 't',
      created: '2026-10-12',
    }).replace(
      'No findings recorded yet. Replace this line with findings, or write "No defects found." once the review is complete.',
      '',
    );
    Vitest.expect(Review.verifyRoundFile('001', text).valid).toBe(false);
  });
});

Vitest.describe('Review.parseRound', () => {
  Vitest.it('reads findings and their fields', () => {
    const parsed = Review.parseRound('001', validRound());
    Vitest.expect(parsed.findings).toHaveLength(1);
    Vitest.expect(parsed.findings[0]?.id).toBe('F1');
    Vitest.expect(parsed.findings[0]?.severity).toBe('Critical');
    Vitest.expect(parsed.findings[0]?.status).toBe('Open');
    Vitest.expect(parsed.metadata['Target']).toBe('the demo');
  });
});

/** A valid round scaffold, optionally attributed to a phase. */
const roundWithPhase = (phase?: string): string =>
  Review.renderRound(
    phase === undefined
      ? { name: 'demo', round: '001', target: 't', created: '2026-10-12' }
      : { name: 'demo', round: '001', target: 't', created: '2026-10-12', phase },
  );

Vitest.describe('Review round Phase metadata', () => {
  Vitest.it('emits an optional - Phase: line after Round', () => {
    const rendered = roundWithPhase('C');
    Vitest.expect(rendered).toContain('- Round: 001\n- Phase: C\n');
    Vitest.expect(Review.verifyRoundFile('001', rendered).valid).toBe(true);
  });

  Vitest.it('round-trips the phase through parseRound', () => {
    Vitest.expect(Review.parseRound('001', roundWithPhase('C')).metadata['Phase']).toBe('C');
  });

  Vitest.it('omits the line when no phase is set', () => {
    Vitest.expect(roundWithPhase()).not.toContain('- Phase:');
    Vitest.expect(roundWithPhase('')).not.toContain('- Phase:');
    Vitest.expect(Review.parseRound('001', roundWithPhase()).metadata['Phase']).toBeUndefined();
  });

  Vitest.it('reports a malformed Phase value', () => {
    const tampered = roundWithPhase().replace('- Round: 001\n', '- Round: 001\n- Phase: 1\n');
    const result = Review.verifyRoundFile('001', tampered);
    Vitest.expect(result.valid).toBe(false);
    Vitest.expect(result.issues.some((found) => found.message.includes('Phase'))).toBe(true);
  });
});
