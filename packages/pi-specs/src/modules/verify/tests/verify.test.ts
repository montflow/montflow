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

  Vitest.it('reports warnings on an otherwise verified result', () => {
    Vitest.expect(
      Verify.infoLine({ valid: true, issues: [Verify.warning('metrics', 'No metrics.')] }),
    ).toBe('✓ verified — 1 warning');
  });
});

Vitest.describe('Verify.severity runtime', () => {
  Vitest.it('defaults an issue to error, leaving verdicts unchanged', () => {
    const found = Verify.issue('id', 'Missing.');
    Vitest.expect(found).toStrictEqual({ field: 'id', message: 'Missing.' });
    Vitest.expect(Verify.severityOf(found)).toBe('error');
    Vitest.expect(Verify.isError(found)).toBe(true);
    Vitest.expect(Verify.isWarning(found)).toBe(false);
  });

  Vitest.it('carries a fix and a line without touching severity', () => {
    Vitest.expect(Verify.issue('tasks', 'Bad row.', 'Remove the row.', 7)).toStrictEqual({
      field: 'tasks',
      message: 'Bad row.',
      fix: 'Remove the row.',
      line: 7,
    });
  });

  Vitest.it('marks a warning and keeps it advisory', () => {
    const found = Verify.warning('metrics', 'No metrics recorded.', 'Add a metrics section.');
    Vitest.expect(Verify.severityOf(found)).toBe('warning');
    Vitest.expect(Verify.isWarning(found)).toBe(true);
    Vitest.expect(Verify.noErrors([found])).toBe(true);
    Vitest.expect(Verify.errorCount([found])).toBe(0);
    Vitest.expect(Verify.warningCount([found])).toBe(1);
  });

  Vitest.it('promotes warnings to errors', () => {
    const promoted = Verify.promoteWarnings([
      Verify.warning('metrics', 'No metrics recorded.', 'Add a metrics section.'),
      Verify.issue('id', 'Missing.'),
    ]);
    Vitest.expect(Verify.errorCount(promoted)).toBe(2);
    Vitest.expect(Verify.warningCount(promoted)).toBe(0);
    Vitest.expect(Verify.noErrors(promoted)).toBe(false);
    Vitest.expect(promoted[0]).toStrictEqual({
      field: 'metrics',
      message: 'No metrics recorded.',
      fix: 'Add a metrics section.',
    });
  });
});
