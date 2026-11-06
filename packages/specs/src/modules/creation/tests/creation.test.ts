import * as Vitest from '@effect/vitest';

import { specMarkdown } from '../../spec/tests/helpers.js';
import { verifyRigorCeilings } from '../../structure/structure.rigor.module.js';
import { creationOf, declaredRigorOfSpec, raisedFromOfSpec, rigorOfSpec } from '../index.js';

/**
 * The `## Creation` record is the only place a spec names its rigor. An
 * accepted escalation writes `rigor: <new> (raised-from <old>)`, so the parser
 * must read the suffix rather than skip the line; anything it cannot parse is
 * an unknown value the verifier reports, never an absent record.
 */

const record = (lines: ReadonlyArray<string>): string =>
  [specMarkdown({ version: '2' }), '', '## Creation', '', ...lines, ''].join('\n');

Vitest.describe('Creation.record runtime', () => {
  Vitest.it('parses an accepted escalation suffix as the raised level plus its base', () => {
    const markdown = record([
      '- rigor: light (raised-from trivial)',
      '- questions 1/1',
      '- unresolved: none',
    ]);
    const creation = creationOf(markdown);
    Vitest.expect(creation.rigor).toBe('light');
    Vitest.expect(creation.declaredRigor).toBe('light');
    Vitest.expect(creation.raisedFrom).toBe('trivial');
    Vitest.expect(creation.declaredRaisedFrom).toBe('trivial');
    Vitest.expect(creation.questions).toStrictEqual({ count: 1, budget: 1 });
    Vitest.expect(rigorOfSpec(markdown)).toBe('light');
    Vitest.expect(raisedFromOfSpec(markdown)).toBe('trivial');
  });

  Vitest.it('reads an unknown suffix as rigor.unknown, never as no rigor', () => {
    const markdown = record([
      '- rigor: light (raised-from mystery)',
      '- questions 0/2',
      '- unresolved: none',
    ]);
    Vitest.expect(rigorOfSpec(markdown)).toBeUndefined();
    Vitest.expect(declaredRigorOfSpec(markdown)).toBe('light (raised-from mystery)');
    Vitest.expect(raisedFromOfSpec(markdown)).toBeUndefined();

    const issues = verifyRigorCeilings({
      specText: markdown,
      phaseDirs: [],
      tasks: new Map(),
    });
    Vitest.expect(issues.map((issue: { code?: string }) => issue.code)).toContain('rigor.unknown');
  });

  Vitest.it('reads any malformed rigor line as rigor.unknown', () => {
    const markdown = record([
      '- rigor: light trailing words',
      '- questions 0/2',
      '- unresolved: none',
    ]);
    Vitest.expect(rigorOfSpec(markdown)).toBeUndefined();
    Vitest.expect(declaredRigorOfSpec(markdown)).toBe('light trailing words');
    Vitest.expect(creationOf(markdown).raisedFrom).toBeUndefined();
    Vitest.expect(
      verifyRigorCeilings({ specText: markdown, phaseDirs: [], tasks: new Map() }).map(
        (issue: { code?: string }) => issue.code,
      ),
    ).toContain('rigor.unknown');
  });
});
