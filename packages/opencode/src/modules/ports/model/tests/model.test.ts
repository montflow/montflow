import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import * as ModelPort from '../index.js';

/** Minimal catalog entry; the port only reads `providerID`, `id`, and variants. */
const info = (
  providerID: string,
  id: string,
  variants?: readonly ModelPort.ModelVariant[],
): ModelPort.ModelEntry => {
  const entry = { providerID, id };
  return variants === undefined ? entry : { ...entry, variants };
};

const catalogue = [info('anthropic', 'claude-sonnet-4'), info('openai', 'gpt-5')];

const makeContext = (overrides: Partial<ModelPort.ModelEditor> = {}): ModelPort.ModelContext => {
  const editor: ModelPort.ModelEditor = {
    list: (providerID) =>
      providerID === undefined
        ? catalogue
        : catalogue.filter((model) => model.providerID === providerID),
    get: (providerID, modelID) =>
      catalogue.find((model) => model.providerID === providerID && model.id === modelID),
    default: { get: () => ({ providerID: 'anthropic', modelID: 'claude-sonnet-4' }) },
    ...overrides,
  };
  return {
    model: {
      transform: (callback) =>
        Effect.sync(() => {
          callback(editor);
          return { dispose: Effect.void };
        }),
      list: () => Effect.succeed({ data: catalogue }),
      default: () => Effect.succeed({ data: catalogue[0] }),
    },
  };
};

Vitest.describe('ModelPort runtime', () => {
  Vitest.it.effect('list flattens the catalogue into provider/model-id labels', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(makeContext());
      Vitest.expect(yield* port.list()).toStrictEqual([
        { label: 'anthropic/claude-sonnet-4', providerID: 'anthropic', modelID: 'claude-sonnet-4' },
        { label: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5' },
      ]);
    }),
  );

  Vitest.it.effect('list filters by provider when given one', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(makeContext());
      Vitest.expect(yield* port.list('openai')).toStrictEqual([
        { label: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5' },
      ]);
    }),
  );

  Vitest.it.effect('list carries effort variants, known-empty, and unknown distinctly', () =>
    Effect.gen(function* () {
      const variants = [
        info('anthropic', 'claude-sonnet-4', [{ id: 'low' }, { id: 'high' }]),
        info('openai', 'gpt-5', []),
        info('openai', 'gpt-5-mini'),
      ];
      const port = ModelPort.makeModelPort({
        model: {
          transform: (callback) =>
            Effect.sync(() => {
              callback({
                list: () => variants,
                get: () => undefined,
                default: { get: () => undefined },
              });
              return { dispose: Effect.void };
            }),
          list: () => Effect.succeed({ data: variants }),
          default: () => Effect.succeed({ data: undefined }),
        },
      });
      Vitest.expect(yield* port.list()).toStrictEqual([
        {
          label: 'anthropic/claude-sonnet-4',
          providerID: 'anthropic',
          modelID: 'claude-sonnet-4',
          variants: ['low', 'high'],
        },
        { label: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5', variants: [] },
        { label: 'openai/gpt-5-mini', providerID: 'openai', modelID: 'gpt-5-mini' },
      ]);
    }),
  );

  Vitest.it.effect('get and default read the live editor', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(makeContext());
      Vitest.expect(yield* port.get('openai', 'gpt-5')).toStrictEqual(info('openai', 'gpt-5'));
      Vitest.expect(yield* port.get('openai', 'missing')).toBeUndefined();
      Vitest.expect(yield* port.default()).toStrictEqual({
        providerID: 'anthropic',
        modelID: 'claude-sonnet-4',
      });
    }),
  );

  Vitest.it.effect('resolve parses the persisted label into a branded Ref', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(makeContext());
      Vitest.expect(yield* port.resolve('anthropic/claude-sonnet-4')).toStrictEqual({
        providerID: 'anthropic',
        id: 'claude-sonnet-4',
      });
    }),
  );

  Vitest.it.effect('resolve rejects a label without a provider', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(makeContext());
      const error = yield* port.resolve('not-a-model').pipe(Effect.flip);
      Vitest.expect(error).toBeInstanceOf(ModelPort.ModelResolveError);
      Vitest.expect(error.label).toBe('not-a-model');
    }),
  );

  Vitest.it.effect('fails at call time without a server context', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort({});
      const error = yield* port.list().pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});

Vitest.describe('ModelPort TUI half', () => {
  const tuiContext: ModelPort.ModelContext = {
    data: {
      location: {
        model: {
          list: () => catalogue,
        },
      },
    },
    ui: {
      model: {
        current: () => ({ providerID: 'openai', modelID: 'gpt-5' }),
      },
    },
  };

  Vitest.it.effect('list reads the location catalogue synced by the host', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(tuiContext);
      Vitest.expect(yield* port.list()).toStrictEqual([
        { label: 'anthropic/claude-sonnet-4', providerID: 'anthropic', modelID: 'claude-sonnet-4' },
        { label: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5' },
      ]);
      Vitest.expect(yield* port.list('anthropic')).toStrictEqual([
        { label: 'anthropic/claude-sonnet-4', providerID: 'anthropic', modelID: 'claude-sonnet-4' },
      ]);
    }),
  );

  Vitest.it.effect('list carries the same variant shape from the TUI catalogue', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort({
        data: {
          location: {
            model: {
              list: () => [
                info('anthropic', 'claude-sonnet-4', [{ id: 'max' }]),
                info('openai', 'gpt-5', []),
              ],
            },
          },
        },
      });
      Vitest.expect(yield* port.list()).toStrictEqual([
        {
          label: 'anthropic/claude-sonnet-4',
          providerID: 'anthropic',
          modelID: 'claude-sonnet-4',
          variants: ['max'],
        },
        { label: 'openai/gpt-5', providerID: 'openai', modelID: 'gpt-5', variants: [] },
      ]);
    }),
  );

  Vitest.it.effect('get reads the catalogue and default reads the prompt model', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort(tuiContext);
      Vitest.expect(yield* port.get('openai', 'gpt-5')).toStrictEqual(info('openai', 'gpt-5'));
      Vitest.expect(yield* port.get('openai', 'missing')).toBeUndefined();
      Vitest.expect(yield* port.default()).toStrictEqual({
        providerID: 'openai',
        modelID: 'gpt-5',
      });
    }),
  );

  Vitest.it.effect('default is undefined before the prompt selects a model', () =>
    Effect.gen(function* () {
      const port = ModelPort.makeModelPort({
        data: tuiContext.data,
        ui: { model: { current: () => undefined } },
      });
      Vitest.expect(yield* port.default()).toBeUndefined();
    }),
  );
});
