import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { InteractionPort } from '../../../modules/ports/interaction/index.js';
import type { ModelDescriptor, ModelPort } from '../../../modules/ports/model/index.js';
import * as ModelPortModule from '../../../modules/ports/model/index.js';
import * as ModelPicker from '../index.js';

const models: ReadonlyArray<ModelDescriptor> = [
  { label: 'anthropic/claude-sonnet-4', providerID: 'anthropic', modelID: 'claude-sonnet-4' },
  { label: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5' },
];

const makePorts = (picked: string | undefined) => {
  const seen: Array<ReadonlyArray<string>> = [];
  const interaction: InteractionPort = {
    select: <Value>(options: {
      readonly title: string;
      readonly options: ReadonlyArray<{
        readonly title: string;
        readonly value: Value;
      }>;
    }) => {
      seen.push(options.options.map((option) => option.title));
      const match = options.options.find(
        (option) => option.title === picked || option.value === picked,
      );
      return Effect.succeed<Value | undefined>(match?.value);
    },
    confirm: () => Effect.succeed(true),
    prompt: () => Effect.succeed(undefined),
    alert: () => Effect.void,
    notify: () => Effect.void,
    attention: () => Effect.succeed({ ok: true, notification: true, sound: true }),
  };
  const model: ModelPort = {
    list: () => Effect.succeed(models),
    get: () => Effect.succeed(undefined),
    default: () => Effect.succeed(undefined),
    resolve: () => Effect.fail(new ModelPortModule.ModelResolveError({ label: '', message: '' })),
  };
  return { interaction, model, seen };
};

Vitest.describe('model picker widget', () => {
  Vitest.it('modelOptions pins the current label first and deduplicates', () => {
    Vitest.expect(ModelPicker.modelOptions(models, 'openai/gpt-5')).toStrictEqual([
      { label: 'openai/gpt-5', current: true },
      { label: 'anthropic/claude-sonnet-4', current: false },
    ]);
  });

  Vitest.it.effect('pickModel shows the catalogue and returns the choice', () =>
    Effect.gen(function* () {
      const { interaction, model, seen } = makePorts('openai/gpt-5');
      const picked = yield* ModelPicker.pickModel(interaction, model, 'openai/gpt-5');
      Vitest.expect(picked).toBe('openai/gpt-5');
      Vitest.expect(seen[0]).toStrictEqual(['openai/gpt-5 (current)', 'anthropic/claude-sonnet-4']);
    }),
  );

  Vitest.it.effect('pickModel returns undefined when the catalogue is empty', () =>
    Effect.gen(function* () {
      const { interaction } = makePorts(undefined);
      const model: ModelPort = {
        list: () => Effect.succeed([]),
        get: () => Effect.succeed(undefined),
        default: () => Effect.succeed(undefined),
        resolve: () => Effect.die(new Error('unused')),
      };
      Vitest.expect(yield* ModelPicker.pickModel(interaction, model)).toBeUndefined();
    }),
  );
});
