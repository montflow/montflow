import { describe, expect, it } from 'vitest';
import {
  computeFixWaves,
  countOpenFindings,
  parseFixPlan,
  parseVerdict,
  resolveRoleModels,
  validateLoopConfig,
} from '../run-loop.ts';

/** Wrap a FIX_PLAN_JSON payload in a plausible fix-plan.md body. */
const planWith = (json: string): string => `# Fix plan\n\nrows…\n\nFIX_PLAN_JSON: ${json}`;

describe('parseVerdict', () => {
  it('parses a well-formed issues verdict', () => {
    expect(parseVerdict('{"verdict":"issues","openIssues":4}')).toEqual({
      verdict: 'issues',
      openIssues: 4,
    });
  });

  it('parses a clean verdict', () => {
    expect(parseVerdict('{"verdict":"clean","openIssues":0}')).toEqual({
      verdict: 'clean',
      openIssues: 0,
    });
  });

  it('rejects a verdict whose fields disagree (wiki §4)', () => {
    expect(parseVerdict('{"verdict":"clean","openIssues":3}')).toBeNull();
  });

  it('rejects malformed JSON and wrong shapes', () => {
    expect(parseVerdict('issues remain')).toBeNull();
    expect(parseVerdict('{"verdict":"maybe","openIssues":1}')).toBeNull();
    expect(parseVerdict('{"verdict":"issues","openIssues":-2}')).toBeNull();
    expect(parseVerdict('{"verdict":"issues","openIssues":1.5}')).toBeNull();
    expect(parseVerdict('{"verdict":"issues"}')).toBeNull();
    expect(parseVerdict('null')).toBeNull();
  });
});

describe('countOpenFindings', () => {
  const canonical = [
    '# Canonical review',
    '',
    '## Findings',
    '',
    '1. HIGH — src/a.ts:12 — [Open]',
    '   Problem: ...',
    '2. LOW — src/b.ts:3 — [Fixed]',
    '3. MEDIUM — src/c.ts:88 — [Open]',
    '',
    'OPEN_ISSUES: 2',
  ].join('\n');

  it('counts only Open-marked severity lines', () => {
    expect(countOpenFindings(canonical)).toBe(2);
  });

  it('counts zero for prose-only reviews', () => {
    expect(countOpenFindings('# Canonical review\n\nNothing found.')).toBe(0);
  });
});

describe('validateLoopConfig', () => {
  const base = {
    maxLoops: 5,
    deadlock: { flipThreshold: 2, action: 'escalate' as const },
  };
  const reviewerGroup = {
    id: 's1',
    kind: 'reviewer-group',
    model: 'test-model',
    reviewers: [{ type: 'builtin' as const, id: 'generic', model: 'test-model' }],
  };
  const fixers = { id: 's2', kind: 'fixers', model: 'test-model' };

  it('accepts the fixed [reviewer-group, fixers] structure', () => {
    expect(validateLoopConfig({ ...base, steps: [reviewerGroup, fixers] })).toBeNull();
  });

  it('rejects step lists that are not exactly two steps', () => {
    expect(validateLoopConfig({ ...base, steps: [fixers] })).toMatch(/different step list/);
  });

  it('rejects an empty reviewer-group roster', () => {
    expect(
      validateLoopConfig({ ...base, steps: [{ ...reviewerGroup, reviewers: [] }, fixers] }),
    ).toMatch(/no reviewers configured/);
  });

  it('rejects non-loop vocab steps in either slot', () => {
    expect(validateLoopConfig({ ...base, steps: [fixers, fixers] })).toMatch(/reviewer-group/);
    expect(validateLoopConfig({ ...base, steps: [reviewerGroup, reviewerGroup] })).toMatch(/fixers/);
  });
});

describe('resolveRoleModels — preset-only model governance', () => {
  const group = {
    id: 's1',
    kind: 'reviewer-group',
    model: 'group-model',
    fallbackModel: 'group-fallback',
    reviewers: [{ type: 'builtin' as const, id: 'generic', model: 'ref-model' }],
  };
  const fixers = { id: 's2', kind: 'fixers', model: 'fixer-model' };
  const base = {
    maxLoops: 5,
    deadlock: { flipThreshold: 2, action: 'escalate' as const },
    steps: [group, fixers],
  };

  it('defaults scoper/supervisor to the user-set group model — never ambient state', () => {
    const roles = resolveRoleModels(base);
    expect(roles.scoper).toEqual({ model: 'group-model', fallbackModel: 'group-fallback' });
    expect(roles.supervisor).toEqual({ model: 'group-model', fallbackModel: 'group-fallback' });
    expect(roles.aggregation).toEqual({ model: 'group-model', fallbackModel: 'group-fallback' });
    expect(roles.fixers).toEqual({ model: 'fixer-model', fallbackModel: undefined });
  });

  it('prefers explicit role configs over the group chain', () => {
    const roles = resolveRoleModels({
      ...base,
      scoper: { model: 'scoper-model', fallbackModel: 'scoper-fallback' },
      supervisor: { model: 'supervisor-model' },
    });
    expect(roles.scoper).toEqual({ model: 'scoper-model', fallbackModel: 'scoper-fallback' });
    expect(roles.supervisor).toEqual({ model: 'supervisor-model', fallbackModel: undefined });
  });

  it('governance: a preset with NO models set is rejected before kickoff', () => {
    const bareGroup = { id: 's1', kind: 'reviewer-group', reviewers: [{ type: 'builtin' as const, id: 'generic' }] };
    const bare = {
      maxLoops: 5,
      deadlock: { flipThreshold: 2, action: 'escalate' as const },
      steps: [bareGroup, { id: 's2', kind: 'fixers' }],
    };
    const error = validateLoopConfig(bare);
    expect(error).toMatch(/No model set for the/);
  });

  it('governance: a fixers step without a model is rejected even when other roles have one', () => {
    const error = validateLoopConfig({
      ...base,
      steps: [group, { id: 's2', kind: 'fixers' }],
    });
    expect(error).toMatch(/fixers/);
  });
});

describe('parseFixPlan — the aggregator’s schedule contract', () => {
  it('accepts a valid parallel + sequential plan', () => {
    const result = parseFixPlan(
      planWith('{"groups":[{"id":"G1","findings":[1,3]},{"id":"G2","findings":[2],"after":["G1"]}]}'),
      3,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.groups).toHaveLength(2);
  });

  it('rejects a plan missing findings', () => {
    const result = parseFixPlan(planWith('{"groups":[{"id":"G1","findings":[1]}]}'), 3);
    expect(!result.ok && result.error).toMatch(/does not cover finding\(s\): 2, 3/);
  });

  it('rejects duplicate findings across groups', () => {
    const result = parseFixPlan(
      planWith('{"groups":[{"id":"G1","findings":[1]},{"id":"G2","findings":[1]}]}'),
      1,
    );
    expect(!result.ok && result.error).toMatch(/appears in both/);
  });

  it('rejects unknown dependencies and self-dependencies', () => {
    const bad = parseFixPlan(planWith('{"groups":[{"id":"G1","findings":[1],"after":["GX"]}]}'), 1);
    expect(!bad.ok && bad.error).toMatch(/unknown group 'GX'/);
    const self = parseFixPlan(planWith('{"groups":[{"id":"G1","findings":[1],"after":["G1"]}]}'), 1);
    expect(!self.ok && self.error).toMatch(/depends on itself/);
  });

  it('rejects dependency cycles', () => {
    const result = parseFixPlan(
      planWith('{"groups":[{"id":"A","findings":[1],"after":["B"]},{"id":"B","findings":[2],"after":["A"]}]}'),
      2,
    );
    expect(!result.ok && result.error).toMatch(/dependency cycle/);
  });

  it('rejects missing or malformed FIX_PLAN_JSON tails', () => {
    expect(parseFixPlan('# no tail', 1).ok).toBe(false);
    expect(parseFixPlan('FIX_PLAN_JSON: {not json}', 1).ok).toBe(false);
    expect(parseFixPlan('FIX_PLAN_JSON: {"groups":[]}', 1).ok).toBe(false);
  });
});

describe('computeFixWaves — dispatch order', () => {
  it('orders groups into dependency levels; independents share a wave', () => {
    const plan = {
      groups: [
        { id: 'C', findings: [3], after: ['A'] },
        { id: 'A', findings: [1, 2], after: [] },
        { id: 'B', findings: [4], after: ['A'] },
      ],
    };
    const waves = computeFixWaves(plan);
    expect(waves.map((wave) => wave.map((g) => g.id).toSorted())).toEqual([['A'], ['B', 'C']]);
  });

  it('puts every independent group in the first wave', () => {
    const plan = {
      groups: [
        { id: 'X', findings: [1], after: [] },
        { id: 'Y', findings: [2], after: [] },
      ],
    };
    expect(computeFixWaves(plan)).toHaveLength(1);
  });
});
