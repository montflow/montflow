import { test, expect } from 'vitest';
import { Schema } from 'effect';
import {
  PresetLoopConfigSchema,
  ReviewPresetFromJson,
  isLoopConfig,
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

const storedConfig = (): PresetLoopConfigDecoded => ({
  reviewers: [
    { type: 'builtin', id: 'generic' },
    { type: 'profile', name: 'security-auditor', model: 'anthropic/claude-sonnet-4-5' },
  ],
  supervisor: { model: 'deepseek-v4-pro' },
  fixerModel: 'deepseek-v4-flash-free',
  maxLoops: 5,
  maxCycles: 4,
  agentConcurrency: 3,
  deadlock: { flipThreshold: 2, action: 'escalate' },
});

test('preset schema: round-trips a stored reference-based config', () => {
  const preset = { version: 1 as const, name: 'demo', config: storedConfig() };
  const json = encode(preset);
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(decoded.version).toBe(1);
  expect(decoded.name).toBe('demo');
  expect(loopOf(decoded).maxLoops).toBe(5);
  expect(loopOf(decoded).maxCycles).toBe(4);
  expect(loopOf(decoded).supervisor.model).toBe('deepseek-v4-pro');
  expect(loopOf(decoded).reviewers).toHaveLength(2);
});

test('preset schema: round-trips fallback model chains for every role', () => {
  const preset = {
    version: 1 as const,
    name: 'fallbacks',
    config: {
      reviewers: [
        {
          type: 'builtin' as const,
          id: 'generic',
          model: 'primary-rev',
          fallbackModels: ['fb-rev-1', 'fb-rev-2'],
        },
        { type: 'profile' as const, name: 'auditor', model: 'auditor-rev' },
      ],
      supervisor: {
        model: 'primary-sup',
        fallbackModels: ['fb-sup-1'],
      },
      fixerModel: 'primary-fixer',
      fixerFallbackModels: ['fb-fixer-1', 'fb-fixer-2'],
      maxLoops: 2,
      maxCycles: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' as const },
    },
  };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  expect(loopOf(decoded).reviewers[0]?.fallbackModels).toEqual(['fb-rev-1', 'fb-rev-2']);
  expect(loopOf(decoded).reviewers[1]?.fallbackModels).toBeUndefined();
  expect(loopOf(decoded).supervisor.fallbackModels).toEqual(['fb-sup-1']);
  expect(loopOf(decoded).fixerFallbackModels).toEqual(['fb-fixer-1', 'fb-fixer-2']);
  // A config without fallbacks still decodes (all optional).
  const plain = decode(encode({ version: 1 as const, name: 'plain', config: storedConfig() })) as ReviewPresetDecoded;
  expect(loopOf(plain).fixerFallbackModels).toBeUndefined();
  expect(loopOf(plain).supervisor.fallbackModels).toBeUndefined();
});

test('preset schema: encoded JSON is compact references — no expanded profile data', () => {
  const json = encode({ version: 1 as const, name: 'demo', config: storedConfig() });
  expect(json).not.toContain('objective');
  expect(json).not.toContain('skillPath');
  expect(json).not.toContain('label');
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
      reviewers: [{ type: 'builtin', id: 'generic' }],
      supervisor: { model: 'm' },
      fixerModel: 'f',
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const parsed = JSON.parse(json) as { config: { reviewers: Array<{ model?: string }> } };
  expect(parsed.config.reviewers[0]?.model).toBeUndefined();
});

test('preset schema: decodes presets that omit the model override', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    config: {
      reviewers: [{ type: 'profile', name: 'auditor' }],
      supervisor: { model: 'm' },
      fixerModel: 'f',
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(loopOf(decoded).reviewers[0]).toEqual({ type: 'profile', name: 'auditor' });
});

test('preset schema: legacy presets without agentConcurrency still decode', () => {
  const legacy = JSON.stringify({
    version: 1,
    name: 'old',
    config: {
      reviewers: [{ type: 'builtin', id: 'generic' }],
      supervisor: { model: 'm' },
      fixerModel: 'f',
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  const decoded = decode(legacy) as ReviewPresetDecoded;
  expect(loopOf(decoded).agentConcurrency).toBeUndefined();
  // Legacy presets also omit maxCycles — optional, resolution fills the cap.
  expect(loopOf(decoded).maxCycles).toBeUndefined();
});

test('preset schema: round-trips thinking levels for every role', () => {
  const preset = {
    version: 1 as const,
    name: 'thinking',
    config: {
      reviewers: [
        { type: 'builtin' as const, id: 'generic', thinkingLevel: 'high' as const },
        {
          type: 'profile' as const,
          name: 'auditor',
          model: 'auditor-rev',
          thinkingLevel: 'xhigh' as const,
        },
      ],
      supervisor: {
        model: 'sup',
        thinkingLevel: 'max' as const,
      },
      fixerModel: 'fixer',
      fixerThinkingLevel: 'low' as const,
      maxLoops: 2,
      maxCycles: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' as const },
    },
  };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  expect(loopOf(decoded).reviewers[0]?.thinkingLevel).toBe('high');
  expect(loopOf(decoded).reviewers[1]?.thinkingLevel).toBe('xhigh');
  expect(loopOf(decoded).supervisor.thinkingLevel).toBe('max');
  expect(loopOf(decoded).fixerThinkingLevel).toBe('low');
  // Levels are omitted (not null) when unset — a config without them decodes.
  const plain = decode(encode({ version: 1 as const, name: 'plain', config: storedConfig() })) as ReviewPresetDecoded;
  expect(loopOf(plain).supervisor.thinkingLevel).toBeUndefined();
  expect(loopOf(plain).fixerThinkingLevel).toBeUndefined();
  expect(loopOf(plain).reviewers[0]?.thinkingLevel).toBeUndefined();
});

test('preset schema: rejects an unknown thinking level', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    config: {
      reviewers: [{ type: 'builtin', id: 'generic', thinkingLevel: 'turbo' }],
      supervisor: { model: 'm' },
      fixerModel: 'f',
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  expect(() => decode(json)).toThrow();
});

test('preset schema: rejects legacy expanded reviewer entries', () => {
  const legacy = JSON.stringify({
    version: 1,
    name: 'old',
    config: {
      reviewers: [
        { id: 'generic', label: 'Generic', model: 'm', skillPath: 's', objective: 'o', focus: 'o' },
      ],
      supervisor: { model: 'm', skillPath: 's' },
      fixerModel: 'f',
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
      reviewers: [],
      supervisor: { model: 'm' },
      fixerModel: 'f',
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
      reviewers: [{ type: 'other', id: 'nope' }],
      supervisor: { model: 'm' },
      fixerModel: 'f',
      maxLoops: 3,
      deadlock: { flipThreshold: 2, action: 'escalate' },
    },
  });
  expect(() => decode(json)).toThrow();
});

test('preset schema: PresetLoopConfigSchema decodes the stored shape', () => {
  const decoded = Schema.decodeUnknownSync(PresetLoopConfigSchema)(storedConfig());
  expect(decoded.reviewers.map((ref) => ref.type)).toEqual(['builtin', 'profile']);
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

test('preset schema: workflow presets round-trip open-ended steps', () => {
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
  const preset = { version: 1 as const, type: 'workflow' as const, name: 'pipeline', config: workflow };
  const json = encode(preset);
  expect(JSON.parse(json).type).toBe('workflow');
  const decoded = decode(json) as ReviewPresetDecoded;
  expect(decoded.type).toBe('workflow');
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
    throw new Error('expected a workflow config');
  }
});

test('preset schema: an empty reviewer step round-trips as unconfigured', () => {
  const workflow: PresetWorkflowConfigDecoded = {
    steps: [{ id: 's1', kind: 'reviewer' }],
  };
  const preset = { version: 1 as const, type: 'workflow' as const, name: 'empty', config: workflow };
  const decoded = decode(encode(preset)) as ReviewPresetDecoded;
  if (isLoopConfig(decoded.config)) throw new Error('expected a workflow config');
  expect(decoded.config.steps[0]?.reviewer).toBeUndefined();
});

test('preset schema: a workflow config without an explicit type is rejected', () => {
  const json = JSON.stringify({
    version: 1,
    name: 'x',
    config: { steps: [{ id: 's1', kind: 'reviewer' }] },
  });
  expect(() => decode(json)).toThrow();
});

test('preset schema: mismatched type/config pairs are rejected', () => {
  const loopTypeWorkflowConfig = JSON.stringify({
    version: 1,
    name: 'x',
    type: 'loop',
    config: { steps: [{ id: 's1', kind: 'reviewer' }] },
  });
  expect(() => decode(loopTypeWorkflowConfig)).toThrow();

  const workflowTypeLoopConfig = JSON.stringify({
    version: 1,
    name: 'x',
    type: 'workflow',
    config: storedConfig(),
  });
  expect(() => decode(workflowTypeLoopConfig)).toThrow();
});

// Compile-time checks: the decoded types expose the expected fields.
type _PresetCheck = ReviewPresetDecoded;
type _ConfigCheck = PresetLoopConfigDecoded;
