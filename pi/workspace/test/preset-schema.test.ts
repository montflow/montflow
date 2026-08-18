import { test, expect } from 'vitest';
import { Schema } from 'effect';
import {
  PresetLoopConfigSchema,
  ReviewPresetFromJson,
  isLoopConfig,
  isLoopPreset,
  isWorkflowPreset,
  presetTypeOf,
  type PresetLoopConfigDecoded,
  type PresetWorkflowConfigDecoded,
  type ReviewPresetDecoded,
} from '../preset-schema';

const encode = (preset: unknown): string =>
  Schema.encodeUnknownSync(ReviewPresetFromJson)(preset as never);

const decode = (json: string): unknown =>
  Schema.decodeUnknownSync(ReviewPresetFromJson)(json);

/** Narrows a decoded preset to its loop config (all existing fixtures are loops). */
const loopOf = (preset: ReviewPresetDecoded): PresetLoopConfigDecoded => {
  if (!isLoopConfig(preset.config)) throw new Error('expected a loop preset');
  return preset.config;
};

/** Roster entry union: a bare reviewer ref, or a spec entry { reviewer, prompt? }. */
type RosterEntry = NonNullable<PresetLoopConfigDecoded['steps'][number]['reviewers']>[number]

/** Narrow a roster entry to its bare reviewer ref (undefined for spec entries). */
const bareRefOf = (entry: RosterEntry | undefined): Extract<RosterEntry, { type: 'builtin' | 'profile' }> | undefined =>
  entry !== undefined && !('reviewer' in entry) ? entry : undefined

const storedConfig = (): PresetLoopConfigDecoded => ({
  steps: [
    {
      id: 's1',
      kind: 'reviewer-group',
      label: 'Reviewers',
      concurrency: 3,
      reviewers: [
        { type: 'builtin', id: 'generic' },
        { type: 'profile', name: 'security-auditor', model: 'anthropic/claude-sonnet-4-5' },
      ],
    },
    { id: 's2', kind: 'aggregation', label: 'Aggregate', model: 'deepseek-v4-pro' },
    { id: 's3', kind: 'fixers', label: 'Fix', model: 'deepseek-v4-flash-free', concurrency: 2 },
  ],
  maxLoops: 5,
  maxCycles: 4,
  deadlock: { flipThreshold: 2, action: 'escalate' },
});

test('preset schema: round-trips a stored loop config', () => {
  const preset = { version: 1 as const, name: 'demo', config: storedConfig() };
  const json = encode(preset);
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(decoded.version).toBe(1);
  expect(decoded.name).toBe('demo');
  const config = loopOf(decoded);
  expect(config.maxLoops).toBe(5);
  expect(config.maxCycles).toBe(4);
  expect(config.steps).toHaveLength(3);
  // Reviewer-group step keeps its roster + concurrency.
  const group = config.steps[0];
  expect(group?.kind).toBe('reviewer-group');
  expect(group?.concurrency).toBe(3);
  expect(group?.reviewers).toEqual([
    { type: 'builtin', id: 'generic' },
    { type: 'profile', name: 'security-auditor', model: 'anthropic/claude-sonnet-4-5' },
  ]);
  // Aggregation and fixers steps keep their models.
  expect(config.steps[1]?.model).toBe('deepseek-v4-pro');
  expect(config.steps[2]?.model).toBe('deepseek-v4-flash-free');
  expect(config.steps[2]?.concurrency).toBe(2);
});

test('preset schema: round-trips fallback model chains on reviewer refs', () => {
  const preset = {
    version: 1 as const,
    name: 'fallbacks',
    config: {
      steps: [
        {
          id: 's1',
          kind: 'reviewer-group' as const,
          label: 'G',
          reviewers: [
            {
              type: 'builtin' as const,
              id: 'generic',
              model: 'primary-rev',
              fallbackModel: 'fb-rev-1',
            },
            { type: 'profile' as const, name: 'auditor', model: 'auditor-rev' },
          ],
        },
        { id: 's2', kind: 'aggregation' as const, model: 'primary-agg' },
      ],
      maxLoops: 2,
      maxCycles: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' as const },
    },
  };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  const config = loopOf(decoded);
  const roster = config.steps[0]?.reviewers ?? [];
  const rev0 = roster[0];
  if (rev0 === undefined || 'reviewer' in rev0) throw new Error('expected a bare ref');
  const rev1 = roster[1];
  if (rev1 === undefined || 'reviewer' in rev1) throw new Error('expected a bare ref');
  expect(rev0.fallbackModel).toBe('fb-rev-1');
  expect(rev1.fallbackModel).toBeUndefined();
  expect(config.steps[1]?.model).toBe('primary-agg');
  // A config without fallbacks still decodes (all optional).
  const plain = decode(encode({ version: 1 as const, name: 'plain', config: storedConfig() })) as ReviewPresetDecoded;
  expect(bareRefOf(loopOf(plain).steps[0]?.reviewers?.[0])?.fallbackModel).toBeUndefined();
});

test('preset schema: encoded JSON is compact references — no expanded profile data', () => {
  const json = encode({ version: 1 as const, name: 'demo', config: storedConfig() });
  expect(json).not.toContain('objective');
  expect(json).not.toContain('skillPath');
  expect(json).not.toContain('focus');
  expect(json).toContain('"type":"builtin"');
  expect(json).toContain('"type":"profile"');
  expect(json).toContain('"name":"security-auditor"');
});

test('preset schema: builtin ref with default model omits the model field', () => {
  const json = encode({
    version: 1 as const,
    name: 'demo',
    config: {
      steps: [
        {
          id: 's1',
          kind: 'reviewer-group',
          reviewers: [{ type: 'builtin', id: 'generic' }],
        },
      ],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const parsed = JSON.parse(json) as {
    config: { steps: Array<{ reviewers: Array<{ model?: string }> }> };
  };
  expect(parsed.config.steps[0]?.reviewers[0]?.model).toBeUndefined();
});

test('preset schema: decodes presets that omit the model override', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    config: {
      steps: [
        { id: 's1', kind: 'reviewer-group', reviewers: [{ type: 'profile', name: 'auditor' }] },
      ],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(loopOf(decoded).steps[0]?.reviewers?.[0]).toEqual({ type: 'profile', name: 'auditor' });
});

test('preset schema: legacy loop without maxCycles still decodes', () => {
  const legacy = JSON.stringify({
    version: 1,
    name: 'old',
    config: {
      steps: [{ id: 's1', kind: 'reviewer', reviewer: { type: 'builtin', id: 'generic' } }],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const decoded = decode(legacy) as ReviewPresetDecoded;
  // maxCycles is optional — resolution fills the per-loop cycle cap.
  expect(loopOf(decoded).maxCycles).toBeUndefined();
});

test('preset schema: round-trips thinking levels on reviewer refs; rejects unknown levels', () => {
  const preset = {
    version: 1 as const,
    name: 'thinking',
    config: {
      steps: [
        {
          id: 's1',
          kind: 'reviewer-group' as const,
          reviewers: [
            { type: 'builtin' as const, id: 'generic', thinkingLevel: 'high' as const },
            {
              type: 'profile' as const,
              name: 'auditor',
              model: 'auditor-rev',
              thinkingLevel: 'xhigh' as const,
            },
          ],
        },
      ],
      maxLoops: 2,
      maxCycles: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' as const },
    },
  };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  const roster = loopOf(decoded).steps[0]?.reviewers ?? [];
  const rev0 = roster[0];
  if (rev0 === undefined || 'reviewer' in rev0) throw new Error('expected a bare ref');
  const rev1 = roster[1];
  if (rev1 === undefined || 'reviewer' in rev1) throw new Error('expected a bare ref');
  expect(rev0.thinkingLevel).toBe('high');
  expect(rev1.thinkingLevel).toBe('xhigh');
  // Levels are omitted (not null) when unset — a config without them decodes.
  const plain = decode(encode({ version: 1 as const, name: 'plain', config: storedConfig() })) as ReviewPresetDecoded;
  expect(bareRefOf(loopOf(plain).steps[0]?.reviewers?.[0])?.thinkingLevel).toBeUndefined();

  const badLevel = JSON.stringify({
    version: 1,
    name: 'x',
    config: {
      steps: [
        { id: 's1', kind: 'reviewer-group', reviewers: [{ type: 'builtin', id: 'generic', thinkingLevel: 'turbo' }] },
      ],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  expect(() => decode(badLevel)).toThrow();
});

test('preset schema: rejects an expanded reviewer entry inside a group', () => {
  const legacy = JSON.stringify({
    version: 1,
    name: 'old',
    config: {
      steps: [
        {
          id: 's1',
          kind: 'reviewer-group',
          reviewers: [
            { id: 'generic', label: 'Generic', model: 'm', skillPath: 's', objective: 'o', focus: 'o' },
          ],
        },
      ],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  // The expanded entry has no `type` discriminator — the schema rejects it.
  expect(() => decode(legacy)).toThrow();
});

test('preset schema: rejects unknown version, non-JSON, unknown deadlock action', () => {
  expect(() => decode(JSON.stringify({ version: 2, name: 'x' }))).toThrow();
  expect(() => decode(JSON.stringify({ name: 'x', config: {} }))).toThrow();
  expect(() => decode('not json')).toThrow();

  const badAction = JSON.stringify({
    version: 1,
    name: 'x',
    config: {
      steps: [],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'auto-fix' },
    },
  });
  expect(() => decode(badAction)).toThrow();
});

test('preset schema: unknown reviewer type is rejected', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    config: {
      steps: [
        { id: 's1', kind: 'reviewer-group', reviewers: [{ type: 'other', id: 'nope' }] },
      ],
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  expect(() => decode(json)).toThrow();
});

test('preset schema: PresetLoopConfigSchema decodes the stored shape', () => {
  const decoded = Schema.decodeUnknownSync(PresetLoopConfigSchema)(storedConfig());
  expect(decoded.steps.map((step) => step.kind)).toEqual(['reviewer-group', 'aggregation', 'fixers']);
});

test('preset schema: legacy files without a type field decode as loops', () => {
  const legacy = JSON.stringify({ version: 1, name: 'old', config: storedConfig() });
  const decoded = decode(legacy) as ReviewPresetDecoded;
  expect(decoded.type).toBeUndefined(); // legacy — no type field
  expect(presetTypeOf(decoded)).toBe('loop');
  expect(loopOf(decoded).maxLoops).toBe(5);
});

test('preset schema: loop presets round-trip an explicit type', () => {
  const preset = { version: 1 as const, type: 'loop' as const, name: 'demo', config: storedConfig() };
  const json = encode(preset);
  expect(JSON.parse(json).type).toBe('loop');
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(decoded.type).toBe('loop');
  expect(presetTypeOf(decoded)).toBe('loop');
});

test('preset schema: loop steps round-trip the loop vocabulary', () => {
  const config: PresetLoopConfigDecoded = {
    steps: [
      { id: 's1', kind: 'reviewer', label: 'Deep dive', reviewer: { type: 'profile', name: 'data-flow' }, prompt: 'Focus on file-signing flows' },
      { id: 's2', kind: 'human', label: 'Ask the user', model: 'deepseek-v4-pro', prompt: 'Present the findings and ask which to escalate' },
    ],
    maxLoops: 2,
    deadlock: { flipThreshold: 2, action: 'escalate' },
  };
  const preset = { version: 1 as const, type: 'loop' as const, name: 'loop-vocab', config };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  const steps = loopOf(decoded).steps;
  expect(steps[0]?.reviewer).toEqual({ type: 'profile', name: 'data-flow' });
  expect(steps[1]?.kind).toBe('human');
  expect(steps[1]?.model).toBe('deepseek-v4-pro');
  expect(steps[1]?.prompt).toBe('Present the findings and ask which to escalate');
});

test('preset schema: round-trips a single fallback model on step models', () => {
  const config: PresetLoopConfigDecoded = {
    steps: [
      {
        id: 's1',
        kind: 'reviewer-group',
        model: 'primary-agg',
        fallbackModel: 'fb-agg',
        reviewers: [{ type: 'builtin', id: 'generic' }],
      },
      { id: 's2', kind: 'fixers', model: 'primary-fixer', fallbackModel: 'fb-fixer' },
    ],
    maxLoops: 2,
    deadlock: { flipThreshold: 2, action: 'escalate' },
  };
  const decoded = decode(encode({ version: 1 as const, name: 'fb', config })) as ReviewPresetDecoded;
  const steps = loopOf(decoded).steps;
  expect(steps[0]?.fallbackModel).toBe('fb-agg');
  expect(steps[1]?.fallbackModel).toBe('fb-fixer');
  // Optional — omitted decodes as undefined.
  const plain = decode(encode({ version: 1 as const, name: 'plain', config: storedConfig() })) as ReviewPresetDecoded;
  expect(loopOf(plain).steps[0]?.fallbackModel).toBeUndefined();
});

test('preset schema: pipeline presets round-trip open-ended steps', () => {
  const workflow: PresetWorkflowConfigDecoded = {
    description: 'Review then ask the user',
    prompt: 'Stay in the repo, never invent findings',
    steps: [
      {
        id: 's1',
        kind: 'reviewer-group',
        label: 'Reviewers',
        reviewers: [
          { type: 'builtin', id: 'generic' }, // legacy bare ref still decodes
          { reviewer: { type: 'profile', name: 'security-auditor' }, prompt: 'Focus on auth' },
        ],
      },
      { id: 's2', kind: 'reviewer', label: 'Deep dive', reviewer: { type: 'profile', name: 'data-flow' }, prompt: 'Focus on file-signing flows' },
      { id: 's3', kind: 'human', label: 'Ask the user for input' },
      { id: 's4', kind: 'fixer', params: { waves: 2 } },
    ],
  };
  const preset = { version: 1 as const, type: 'pipeline' as const, name: 'pipeline', config: workflow };
  const json = encode(preset);
  expect(JSON.parse(json).type).toBe('pipeline');
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(decoded.type).toBe('pipeline');
  expect(presetTypeOf(decoded)).toBe('pipeline');
  if (!isLoopConfig(decoded.config)) {
    expect(decoded.config.description).toBe('Review then ask the user');
    expect(decoded.config.prompt).toBe('Stay in the repo, never invent findings');
    expect(decoded.config.steps).toHaveLength(4);
    // Reviewer-group steps carry their typed roster (bare refs + spec entries).
    expect(decoded.config.steps[0]?.reviewers).toEqual([
      { type: 'builtin', id: 'generic' },
      { reviewer: { type: 'profile', name: 'security-auditor' }, prompt: 'Focus on auth' },
    ]);
    // Single reviewer steps carry their picked ref (and can be empty).
    expect(decoded.config.steps[1]?.reviewer).toEqual({ type: 'profile', name: 'data-flow' });
    expect(decoded.config.steps[1]?.prompt).toBe('Focus on file-signing flows');
    expect(decoded.config.steps[2]?.label).toBe('Ask the user for input');
    expect(decoded.config.steps[3]?.params).toEqual({ waves: 2 });
    expect(decoded.config.steps[3]?.reviewer).toBeUndefined();
  } else {
    throw new Error('expected a pipeline config');
  }
});

test('preset schema: legacy workflow type decodes as a pipeline', () => {
  // Files saved before the workflow → pipeline rename keep `type: "workflow"`
  // until their next save; they must still parse and normalize to pipeline.
  const legacy = JSON.stringify({
    version: 1,
    name: 'legacy',
    type: 'workflow',
    config: { steps: [{ id: 's1', kind: 'human', label: 'Ask the user' }] },
  });
  const decoded = decode(legacy) as ReviewPresetDecoded;
  expect(decoded.type).toBe('workflow');
  expect(presetTypeOf(decoded)).toBe('pipeline');
  expect(isWorkflowPreset(decoded)).toBe(true);
  expect(isLoopPreset(decoded)).toBe(false);
});

test('preset schema: an empty reviewer step round-trips as unconfigured', () => {
  const workflow: PresetWorkflowConfigDecoded = {
    steps: [{ id: 's1', kind: 'reviewer' }],
  };
  const preset = { version: 1 as const, type: 'pipeline' as const, name: 'empty', config: workflow };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  if (isLoopConfig(decoded.config)) throw new Error('expected a pipeline config');
  expect(decoded.config.steps[0]?.reviewer).toBeUndefined();
});

test('preset schema: a steps-only config without a type is rejected', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    config: { steps: [{ id: 's1', kind: 'reviewer' }] },
  });
  // A pipeline must declare its type; a loop requires the execution fields.
  expect(() => decode(json)).toThrow();
});

test('preset schema: a loop config with a pipeline type is accepted (type is the discriminator)', () => {
  // Both configs are step pipelines now — the `type` field is the
  // discriminator. A loop-shaped config stored under a pipeline type decodes
  // (the pipeline member ignores the extra loop fields).
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    type: 'workflow',
    config: storedConfig(),
  });
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(presetTypeOf(decoded)).toBe('pipeline');
});

test('preset schema: a loop type with a bare steps config is rejected', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    type: 'loop',
    config: { steps: [{ id: 's1', kind: 'reviewer' }] },
  });
  // Loop config requires maxLoops + deadlock beyond the steps.
  expect(() => decode(json)).toThrow();
});

// Compile-time checks: the decoded types expose the expected fields.
type _PresetCheck = ReviewPresetDecoded;
type _ConfigCheck = PresetLoopConfigDecoded;
