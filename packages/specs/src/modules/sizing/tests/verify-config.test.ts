import * as Vitest from '@effect/vitest';
import * as Sizing from '../index.js';

const repo: Sizing.ConfigSource = { path: 'sizing.json', kind: 'repo' };
const spec: Sizing.ConfigSource = { path: 'ship-login/sizing.json', kind: 'spec' };

Vitest.describe('Sizing.verify runtime', () => {
  Vitest.it('accepts a repo config with every size', () => {
    const result = Sizing.verify(repo, {
      sizes: {
        tiny: { model: 'anthropic/claude-haiku', effort: 'low' },
        small: { model: 'anthropic/claude-haiku' },
        medium: { model: 'anthropic/claude-sonnet' },
        large: { model: 'anthropic/claude-opus', effort: 'max' },
      },
    });
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('accepts a spec config with nested phase overrides', () => {
    const result = Sizing.verify(spec, {
      sizes: { medium: { model: 'anthropic/claude-sonnet' } },
      phases: { A: { sizes: { tiny: { model: 'anthropic/claude-haiku' } } } },
    });
    Vitest.expect(result.issues).toStrictEqual([]);
    Vitest.expect(result.valid).toBe(true);
  });

  Vitest.it('codes malformed JSON with a concrete fix and the decode cause', () => {
    const issue = Sizing.verifyText(repo, '{ nope').issues[0];
    Vitest.expect(issue).toMatchObject({
      code: Sizing.CODES.malformedJson,
      field: 'root',
      message: 'Config is not valid JSON.',
      expected: 'a JSON object with a "sizes" map',
      actual: 'unparseable JSON',
      fix: 'Rewrite sizing.json as valid JSON.',
    });
    Vitest.expect(issue?.cause).toBeDefined();
  });

  Vitest.it('codes an unknown size with expected and actual', () => {
    Vitest.expect(Sizing.verify(repo, { sizes: { huge: { model: 'a/b' } } }).issues).toStrictEqual([
      {
        code: Sizing.CODES.unknownConfigSize,
        field: 'sizes.huge',
        message: "Unknown size 'huge'.",
        expected: 'tiny, small, medium, large',
        actual: 'huge',
        fix: "Rename 'sizes.huge' to one of tiny, small, medium, large, or remove it.",
      },
    ]);
  });

  Vitest.it('codes a missing model', () => {
    Vitest.expect(Sizing.verify(repo, { sizes: { tiny: {} } }).issues).toStrictEqual([
      {
        code: Sizing.CODES.missingModel,
        field: 'sizes.tiny.model',
        message: 'A size entry requires a model.',
        expected: 'provider/model',
        actual: 'missing',
        fix: 'Add "model": "provider/model" to sizes.tiny.',
      },
    ]);
  });

  Vitest.it('codes a malformed model id', () => {
    Vitest.expect(
      Sizing.verify(repo, { sizes: { tiny: { model: 'not-a-model' } } }).issues,
    ).toStrictEqual([
      {
        code: Sizing.CODES.malformedModel,
        field: 'sizes.tiny.model',
        message: 'Model must be a `provider/model` id.',
        expected: 'provider/model',
        actual: 'not-a-model',
        fix: 'Set sizes.tiny.model to a "provider/model" id.',
      },
    ]);
  });

  Vitest.it('codes effort without a model, and the missing model it implies', () => {
    const issues = Sizing.verify(repo, { sizes: { tiny: { effort: 'high' } } }).issues;
    Vitest.expect(issues.map((found) => found.code)).toStrictEqual([
      Sizing.CODES.missingModel,
      Sizing.CODES.effortWithoutModel,
    ]);
    Vitest.expect(issues[1]).toStrictEqual({
      code: Sizing.CODES.effortWithoutModel,
      field: 'sizes.tiny.effort',
      message: 'An effort without a model is invalid.',
      expected: 'a "model" alongside "effort"',
      actual: 'model missing',
      fix: 'Add "model" to sizes.tiny, or remove "effort".',
    });
  });

  Vitest.it('codes a malformed effort token', () => {
    Vitest.expect(
      Sizing.verify(repo, { sizes: { tiny: { model: 'a/b', effort: 'HIGH!' } } }).issues,
    ).toStrictEqual([
      {
        code: Sizing.CODES.malformedEffort,
        field: 'sizes.tiny.effort',
        message: 'Effort must be a non-empty variant token.',
        expected: Sizing.EFFORT_HINT,
        actual: 'HIGH!',
        fix: 'Set sizes.tiny.effort to a token such as "low", "high", or "max".',
      },
    ]);
  });

  Vitest.it('codes an unknown phase key shape', () => {
    Vitest.expect(
      Sizing.verify(spec, { sizes: {}, phases: { a: { sizes: {} } } }).issues,
    ).toStrictEqual([
      {
        code: Sizing.CODES.unknownPhase,
        field: 'phases.a',
        message: "Unknown phase 'a'.",
        expected: 'a phase id such as A or AA',
        actual: 'a',
        fix: "Rename 'phases.a' to a phase id such as A, or remove it.",
      },
    ]);
  });

  Vitest.it('codes a phase the owning spec does not declare', () => {
    const issues = Sizing.verify(
      { ...spec, phases: ['A'] },
      { sizes: {}, phases: { B: { sizes: {} } } },
    ).issues;
    Vitest.expect(issues.map((found) => found.code)).toStrictEqual([Sizing.CODES.unknownPhase]);
    Vitest.expect(issues[0]?.field).toBe('phases.B');
  });

  Vitest.it('codes unknown keys at the root and inside an entry', () => {
    const rootIssues = Sizing.verify(repo, { sizes: {}, phases: {} }).issues;
    Vitest.expect(rootIssues).toStrictEqual([
      {
        code: Sizing.CODES.unknownKey,
        field: 'phases',
        message: "Unknown key 'phases'.",
        expected: 'sizes',
        actual: 'phases',
        fix: "Remove 'phases' from sizing.json.",
      },
    ]);
    const entryIssues = Sizing.verify(repo, {
      sizes: { tiny: { model: 'a/b', variant: 'x' } },
    }).issues;
    Vitest.expect(entryIssues).toStrictEqual([
      {
        code: Sizing.CODES.unknownKey,
        field: 'sizes.tiny.variant',
        message: "Unknown key 'variant' in a size entry.",
        expected: 'model or effort',
        actual: 'variant',
        fix: "Remove 'sizes.tiny.variant'.",
      },
    ]);
  });

  Vitest.it('codes non-object entries, sizes, phases, and configs', () => {
    Vitest.expect(Sizing.verify(repo, { sizes: { tiny: 'a/b' } }).issues).toStrictEqual([
      {
        code: Sizing.CODES.nonObjectEntry,
        field: 'sizes.tiny',
        message: 'A size entry must be an object.',
        expected: 'an object with a "model"',
        actual: 'string',
        fix: 'Rewrite sizes.tiny as { "model": "provider/model" }.',
      },
    ]);
    Vitest.expect(Sizing.verify(repo, { sizes: [] }).issues).toStrictEqual([
      {
        code: Sizing.CODES.nonObjectSizes,
        field: 'sizes',
        message: '`sizes` must be an object keyed by size.',
        expected: 'an object keyed by tiny, small, medium, large',
        actual: 'array',
        fix: 'Rewrite sizes as an object keyed by tiny, small, medium, large.',
      },
    ]);
    Vitest.expect(Sizing.verify(repo, []).issues).toStrictEqual([
      {
        code: Sizing.CODES.malformedConfig,
        field: 'root',
        message: 'Config must be a JSON object.',
        expected: 'an object with a "sizes" map',
        actual: 'array',
        fix: 'Rewrite sizing.json as a JSON object with a "sizes" map.',
      },
    ]);
    Vitest.expect(Sizing.verify(repo, {}).issues).toStrictEqual([
      {
        code: Sizing.CODES.missingSizes,
        field: 'sizes',
        message: 'Config requires a `sizes` map.',
        expected: 'an object keyed by size',
        actual: 'missing',
        fix: 'Add "sizes": {} to sizing.json.',
      },
    ]);
  });

  Vitest.it('codes a malformed phase override', () => {
    Vitest.expect(Sizing.verify(spec, { sizes: {}, phases: { A: 'x' } }).issues).toStrictEqual([
      {
        code: Sizing.CODES.nonObjectPhase,
        field: 'phases.A',
        message: 'A phase override must be an object.',
        expected: 'an object with a "sizes" map',
        actual: 'string',
        fix: 'Rewrite phases.A as { "sizes": {} }.',
      },
    ]);
    Vitest.expect(Sizing.verify(spec, { sizes: {}, phases: { A: {} } }).issues).toStrictEqual([
      {
        code: Sizing.CODES.missingSizes,
        field: 'phases.A.sizes',
        message: 'A phase override requires a `sizes` map.',
        expected: 'an object keyed by size',
        actual: 'missing',
        fix: 'Add "sizes": {} to phases.A.',
      },
    ]);
    Vitest.expect(Sizing.verify(spec, { sizes: {}, phases: [] }).issues).toStrictEqual([
      {
        code: Sizing.CODES.nonObjectPhases,
        field: 'phases',
        message: '`phases` must be an object keyed by phase id.',
        expected: 'an object keyed by phase id such as A',
        actual: 'array',
        fix: 'Rewrite phases as an object keyed by phase id.',
      },
    ]);
  });
});
