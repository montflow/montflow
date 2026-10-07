import * as Vitest from '@effect/vitest';
import * as Verify from '../index.js';

Vitest.describe('Verify.hasSection runtime', () => {
  Vitest.it('matches an exact level-2 heading', () => {
    Vitest.expect(Verify.hasSection('## Context\n\nx\n', 'Context')).toBe(true);
    Vitest.expect(Verify.hasSection('## Contextual\n\nx\n', 'Context')).toBe(false);
    Vitest.expect(Verify.hasSection('### Context\n\nx\n', 'Context')).toBe(false);
  });
});

Vitest.describe('Verify.infoLine runtime', () => {
  Vitest.it('renders the verified check', () => {
    Vitest.expect(Verify.infoLine({ valid: true, issues: [] })).toBe('✓ verified');
  });

  Vitest.it('renders the unverified cross with a count', () => {
    Vitest.expect(
      Verify.infoLine({
        valid: false,
        issues: [
          { field: 'id', message: 'Missing.' },
          { field: 'body', message: 'Missing.' },
        ],
      }),
    ).toBe('✗ not verified — 2 issues');
  });
});
