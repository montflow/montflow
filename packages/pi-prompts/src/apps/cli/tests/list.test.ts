import * as Vitest from '@effect/vitest';
import { Effect, Layer, Schema } from 'effect';
import * as Cli from '../index.js';
import * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';
import * as Prompts from '../../../modules/prompts/index.js';
import { PromptStore } from '../../../services/index.js';

/** A prompt file whose template is non-empty (verifies clean). */
const validRaw = (name: string): string =>
  JSON.stringify({
    name,
    description: 'Does X.',
    template: 'Do X.',
    variables: [],
    skills: [],
    model: '',
  });

/** A prompt file whose empty template is the only verification issue. */
const invalidRaw = (name: string): string =>
  JSON.stringify({
    name,
    description: 'Does X.',
    template: '',
    variables: [],
    skills: [],
    model: '',
  });

const files = new Map<string, string>([
  ['good', validRaw('good')],
  ['bad', invalidRaw('bad')],
]);

/** Decode one fixture through the real prompt schema. */
const decode = (name: string): Prompts.Prompt =>
  Schema.decodeUnknownSync(Prompts.FromJson)(files.get(name) ?? '');

/** Stub store serving the fixture files by name. */
const stubLayer: Layer.Layer<PromptStore.PromptStore> = Layer.succeed(
  PromptStore.PromptStore,
  PromptStore.PromptStore.of({
    list: () => Effect.succeed([...files.keys()].map(decode)),
    remove: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
    save: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
    readRaw: (_cwd: string, name: string) => {
      const raw = files.get(name);
      return raw === undefined
        ? Effect.fail(new PromptStore.StoreError({ message: `Unknown prompt '${name}'.` }))
        : Effect.succeed(raw);
    },
    readAllRaw: () => Effect.succeed([...files.entries()].map(([name, raw]) => ({ name, raw }))),
  }),
);

const run = (options: Engines.ListOptions) =>
  Engines.list({ cwd: '/repo' }, options).pipe(Effect.provide(stubLayer));

Vitest.describe('Engines.list status filter', () => {
  Vitest.it.effect('returns every prompt when no status is given', () =>
    Effect.gen(function* () {
      const prompts = yield* run({});
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['bad', 'good']);
    }),
  );

  Vitest.it.effect('--status valid keeps only files that verify', () =>
    Effect.gen(function* () {
      const prompts = yield* run({ status: 'valid' });
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['good']);
    }),
  );

  Vitest.it.effect('--status invalid keeps only files that fail verification', () =>
    Effect.gen(function* () {
      const prompts = yield* run({ status: 'invalid' });
      Vitest.expect(prompts.map((prompt) => prompt.name)).toStrictEqual(['bad']);
    }),
  );
});

Vitest.describe('Engines.resolveListStatus runtime', () => {
  Vitest.it('treats an absent or empty value as no filter', () => {
    Vitest.expect(Engines.resolveListStatus(undefined).pipe(Effect.runSync)).toBeUndefined();
    Vitest.expect(Engines.resolveListStatus('').pipe(Effect.runSync)).toBeUndefined();
  });

  Vitest.it('accepts the two verification states', () => {
    Vitest.expect(Engines.resolveListStatus('valid').pipe(Effect.runSync)).toBe('valid');
    Vitest.expect(Engines.resolveListStatus('invalid').pipe(Effect.runSync)).toBe('invalid');
  });

  Vitest.it.effect('rejects an unknown status, naming the accepted values', () =>
    Effect.gen(function* () {
      const error = yield* Engines.resolveListStatus('bogus').pipe(Effect.flip);
      Vitest.expect(error).toContain("Unknown status 'bogus'");
      Vitest.expect(error).toContain('valid, invalid');
    }),
  );
});

Vitest.describe('Cli.parseCliArgs list status', () => {
  Vitest.it('parses --status', () => {
    Vitest.expect(Cli.parseCliArgs('list --status=invalid')).toStrictEqual({
      kind: 'List',
      status: 'invalid',
    });
  });

  Vitest.it('parses a bare list as no filter', () => {
    Vitest.expect(Cli.parseCliArgs('list')).toStrictEqual({ kind: 'List', status: undefined });
  });

  Vitest.it('falls back to Help for an unknown flag', () => {
    Vitest.expect(Cli.parseCliArgs('list --bogus')).toStrictEqual({ kind: 'Help' });
  });
});

Vitest.describe('Renderers.list empty messages', () => {
  Vitest.it('points at create when the store is empty', () => {
    Vitest.expect(Renderers.list([])).toContain('No prompts yet');
  });

  Vitest.it('names the filter when nothing matches', () => {
    Vitest.expect(Renderers.list([], { verbose: false, status: 'invalid' })).toBe(
      "No prompts with status 'invalid'.",
    );
  });
});
