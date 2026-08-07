import { test, expect } from 'vitest';
import { Schema } from 'effect';
import {
  PresetLoopConfigSchema,
  ReviewPresetFromJson,
  type PresetLoopConfigDecoded,
  type ReviewPresetDecoded,
} from '../preset-schema';

const encode = (preset: unknown): string =>
  Schema.encodeUnknownSync(ReviewPresetFromJson)(preset as never);

const decode = (json: string): unknown =>
  Schema.decodeUnknownSync(ReviewPresetFromJson)(json);

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
  expect(decoded.config.maxLoops).toBe(5);
  expect(decoded.config.maxCycles).toBe(4);
  expect(decoded.config.supervisor.model).toBe('deepseek-v4-pro');
  expect(decoded.config.reviewers).toHaveLength(2);
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
  expect(decoded.config.reviewers[0]?.fallbackModels).toEqual(['fb-rev-1', 'fb-rev-2']);
  expect(decoded.config.reviewers[1]?.fallbackModels).toBeUndefined();
  expect(decoded.config.supervisor.fallbackModels).toEqual(['fb-sup-1']);
  expect(decoded.config.fixerFallbackModels).toEqual(['fb-fixer-1', 'fb-fixer-2']);
  // A config without fallbacks still decodes (all optional).
  const plain = decode(encode({ version: 1 as const, name: 'plain', config: storedConfig() })) as ReviewPresetDecoded;
  expect(plain.config.fixerFallbackModels).toBeUndefined();
  expect(plain.config.supervisor.fallbackModels).toBeUndefined();
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
  expect(decoded.config.reviewers[0]).toEqual({ type: 'profile', name: 'auditor' });
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
  expect(decoded.config.agentConcurrency).toBeUndefined();
  // Legacy presets also omit maxCycles — optional, resolution fills the cap.
  expect(decoded.config.maxCycles).toBeUndefined();
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

// Compile-time checks: the decoded types expose the expected fields.
type _PresetCheck = ReviewPresetDecoded;
type _ConfigCheck = PresetLoopConfigDecoded;
