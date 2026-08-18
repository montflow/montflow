import { test, expect } from 'vitest';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Model } from '@earendil-works/pi-ai';
import {
  hasModelChoice,
  listModelChoices,
  modelIdOf,
  resolveInitialModel,
} from '../models-client';

/** Minimal model shape used by the picker helpers. */
interface FakeModel {
  readonly provider: string;
  readonly id: string;
  readonly name: string;
}

const model = (provider: string, id: string, name = id): FakeModel => ({
  provider,
  id,
  name,
});

const asModel = (m: FakeModel): Model<any> => m as unknown as Model<any>;

const makeCtx = (options: {
  current?: FakeModel;
  scoped?: readonly FakeModel[];
  available?: readonly FakeModel[];
}): ExtensionContext =>
  ({
    model: options.current === undefined ? undefined : asModel(options.current),
    scopedModels:
      options.scoped === undefined ? [] : options.scoped.map((m) => ({ model: asModel(m) })),
    modelRegistry: {
      getAvailable: () => (options.available ?? []).map(asModel),
    },
  }) as unknown as ExtensionContext;

// ─── modelIdOf ───────────────────────────────────────────────────────

test('modelIdOf: formats provider/model-id', () => {
  expect(modelIdOf(model('anthropic', 'claude-sonnet-4-5'))).toBe('anthropic/claude-sonnet-4-5');
});

// ─── listModelChoices ────────────────────────────────────────────────

test('listModelChoices: uses scoped models when scoping is configured', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    scoped: [model('anthropic', 'claude-sonnet-4-5', 'Claude 4 Sonnet')],
    available: [model('deepseek', 'deepseek-v4-pro')],
  });
  const choices = listModelChoices(ctx);
  expect(choices).toHaveLength(1);
  expect(choices[0]?.id).toBe('anthropic/claude-sonnet-4-5');
  expect(choices[0]?.name).toBe('Claude 4 Sonnet');
});

test('listModelChoices: falls back to the registry when no scoping is configured', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [
      model('deepseek', 'deepseek-v4-pro'),
      model('anthropic', 'claude-sonnet-4-5'),
    ],
  });
  const choices = listModelChoices(ctx);
  expect(choices.map((choice) => choice.id)).toEqual([
    'deepseek/deepseek-v4-pro',
    'anthropic/claude-sonnet-4-5',
  ]);
});

test('listModelChoices: flags the active model as current', () => {
  const ctx = makeCtx({
    current: model('anthropic', 'claude-sonnet-4-5'),
    available: [
      model('deepseek', 'deepseek-v4-pro'),
      model('anthropic', 'claude-sonnet-4-5'),
    ],
  });
  const choices = listModelChoices(ctx);
  expect(choices.find((choice) => choice.id === 'anthropic/claude-sonnet-4-5')?.isCurrent).toBe(
    true,
  );
  expect(choices.find((choice) => choice.id === 'deepseek/deepseek-v4-pro')?.isCurrent).toBe(
    false,
  );
});

test('listModelChoices: empty when nothing is available', () => {
  const ctx = makeCtx({});
  expect(listModelChoices(ctx)).toEqual([]);
});

// ─── hasModelChoice ──────────────────────────────────────────────────

test('hasModelChoice: true for pickable ids, false otherwise', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [model('deepseek', 'deepseek-v4-pro')],
  });
  expect(hasModelChoice(ctx, 'deepseek/deepseek-v4-pro')).toBe(true);
  expect(hasModelChoice(ctx, 'anthropic/claude-sonnet-4-5')).toBe(false);
});

test('hasModelChoice: bare ids resolve like resolveInitialModel', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [
      model('deepseek', 'deepseek-v4-pro'),
      model('anthropic', 'claude-sonnet-4-5'),
    ],
  });
  expect(hasModelChoice(ctx, 'deepseek-v4-pro')).toBe(true);
  expect(hasModelChoice(ctx, 'claude-sonnet-4-5')).toBe(true);
  expect(hasModelChoice(ctx, 'gpt-5')).toBe(false);
});

// ─── resolveInitialModel ─────────────────────────────────────────────

test('resolveInitialModel: undefined when no models are pickable', () => {
  const ctx = makeCtx({});
  expect(resolveInitialModel(ctx)).toBeUndefined();
});

test('resolveInitialModel: preselects the session current model by default', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [model('anthropic', 'claude-sonnet-4-5'), model('deepseek', 'deepseek-v4-pro')],
  });
  expect(resolveInitialModel(ctx)).toBe('deepseek/deepseek-v4-pro');
});

test('resolveInitialModel: preferred id wins over the current model', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [model('anthropic', 'claude-sonnet-4-5'), model('deepseek', 'deepseek-v4-pro')],
  });
  expect(resolveInitialModel(ctx, 'anthropic/claude-sonnet-4-5')).toBe(
    'anthropic/claude-sonnet-4-5',
  );
});

test('resolveInitialModel: skips un-pickable preferences, falls back to current', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [model('deepseek', 'deepseek-v4-pro')],
  });
  expect(resolveInitialModel(ctx, 'anthropic/claude-sonnet-4-5')).toBe(
    'deepseek/deepseek-v4-pro',
  );
});

test('resolveInitialModel: falls back to the first choice when current is not pickable', () => {
  const ctx = makeCtx({
    current: model('custom', 'my-model'),
    available: [model('anthropic', 'claude-sonnet-4-5'), model('deepseek', 'deepseek-v4-pro')],
  });
  expect(resolveInitialModel(ctx)).toBe('anthropic/claude-sonnet-4-5');
});

test('resolveInitialModel: bare preferred id resolves to its provider/model-id form', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [
      model('anthropic', 'claude-sonnet-4-5'),
      model('deepseek', 'deepseek-v4-pro'),
    ],
  });
  expect(resolveInitialModel(ctx, 'deepseek-v4-pro')).toBe('deepseek/deepseek-v4-pro');
});

test('resolveInitialModel: bare id matching a non-current provider via the modelId fallback', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [model('anthropic', 'claude-sonnet-4-5')],
  });
  expect(resolveInitialModel(ctx, 'claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5');
});

test('resolveInitialModel: ambiguous bare id resolves to the first provider in registry order', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    available: [
      model('anthropic', 'claude-sonnet-4-5'),
      model('openrouter', 'claude-sonnet-4-5'),
    ],
  });
  expect(resolveInitialModel(ctx, 'claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5');
});

test('resolveInitialModel: scoped set excluding the current model falls back to the first scoped choice', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    scoped: [model('anthropic', 'claude-sonnet-4-5')],
    available: [model('deepseek', 'deepseek-v4-pro')],
  });
  expect(resolveInitialModel(ctx)).toBe('anthropic/claude-sonnet-4-5');
});

test('resolveInitialModel: bare preferred id resolves within a scoped set', () => {
  const ctx = makeCtx({
    current: model('deepseek', 'deepseek-v4-pro'),
    scoped: [
      model('anthropic', 'claude-sonnet-4-5'),
      model('deepseek', 'deepseek-v4-pro'),
    ],
  });
  expect(resolveInitialModel(ctx, 'claude-sonnet-4-5')).toBe('anthropic/claude-sonnet-4-5');
});
