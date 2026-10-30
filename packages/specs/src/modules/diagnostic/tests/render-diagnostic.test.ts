import * as Vitest from '@effect/vitest';
import { renderDiagnostic, renderDiagnostics } from '../diagnostic.module.js';

/**
 * The one diagnostic block every surface prints: canonical label order, the
 * `!` warning marker, an always-present `next` row, and optional rows that
 * appear only when they carry a value.
 */

const base = {
  code: 'sizing.malformed-json',
  path: 'ship-login/sizing.json',
  field: 'root',
  problem: 'Config is not valid JSON.',
  next: 'mf-specs check --name ship-login',
} as const;

Vitest.describe('Diagnostic.renderDiagnostic', () => {
  Vitest.it('renders the canonical labels in order and ends with next', () => {
    Vitest.expect(
      renderDiagnostic({
        ...base,
        expected: 'a JSON object with a "sizes" map',
        actual: 'unparseable JSON',
        fix: 'Rewrite ship-login/sizing.json as valid JSON.',
      }),
    ).toBe(
      [
        'code     sizing.malformed-json',
        'path     ship-login/sizing.json',
        'field    root',
        'problem  Config is not valid JSON.',
        'expected a JSON object with a "sizes" map',
        'actual   unparseable JSON',
        'fix      Rewrite ship-login/sizing.json as valid JSON.',
        'next     mf-specs check --name ship-login',
      ].join('\n'),
    );
  });

  Vitest.it('marks an advisory code and keeps the next row', () => {
    const text = renderDiagnostic({
      code: 'prompt.skill-advisory',
      path: '.agents/skills/grilling',
      field: 'grilling',
      problem: "Skill 'grilling' is not installed; the prompt renders without it.",
      fix: "Install 'grilling' under .agents/skills/.",
      next: 'mf-specs execute --name <spec>',
      warning: true,
    });
    Vitest.expect(text).toContain('code     ! prompt.skill-advisory');
    Vitest.expect(text.split('\n').at(-1)).toBe('next     mf-specs execute --name <spec>');
  });

  Vitest.it('omits every absent optional row', () => {
    Vitest.expect(renderDiagnostic(base).split('\n')).toStrictEqual([
      'code     sizing.malformed-json',
      'path     ship-login/sizing.json',
      'field    root',
      'problem  Config is not valid JSON.',
      'next     mf-specs check --name ship-login',
    ]);
  });

  Vitest.it('renders the cause chain and layers only verbosely', () => {
    const wrapped = new Error('outer', { cause: new Error('inner') });
    const found = {
      ...base,
      cause: wrapped,
      layers: { consulted: ['repo', 'spec'], layer: 'spec' },
      stack: 'at load (cli.ts:1)',
    };
    Vitest.expect(renderDiagnostic(found, true)).toContain('cause    outer <- inner');
    Vitest.expect(renderDiagnostic(found, true)).toContain(
      'layers   consulted repo,spec · layer spec',
    );
    Vitest.expect(renderDiagnostic(found, true)).toContain('stack    at load (cli.ts:1)');
    // The default block carries no detail rows, so `--verbose` is the one switch.
    Vitest.expect(renderDiagnostic(found)).not.toContain('cause');
    Vitest.expect(renderDiagnostic(found)).not.toContain('layers');
    Vitest.expect(renderDiagnostic(found)).not.toContain('stack');
  });
});

Vitest.describe('Diagnostic.renderDiagnostics', () => {
  Vitest.it('separates blocks with a blank line and renders none as empty', () => {
    Vitest.expect(renderDiagnostics([])).toBe('');
    const text = renderDiagnostics([base, { ...base, code: 'store.error' }]);
    Vitest.expect(text.split('\n\n')).toHaveLength(2);
    Vitest.expect(text).toContain('code     store.error');
  });
});
