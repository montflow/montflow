import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';
import { PromptStore } from '../../../services/index.js';

/** A prompt that verifies clean. */
const validRaw = JSON.stringify({
  name: 'good',
  description: 'Does X.',
  template: 'Do X.',
  variables: [],
  skills: [],
  model: '',
});

/** A prompt whose empty template is its only issue. */
const invalidRaw = JSON.stringify({
  name: 'bad',
  description: 'Does X.',
  template: '',
  variables: [],
  skills: [],
  model: '',
});

/** Not JSON at all — the case `list` silently drops. */
const brokenRaw = '{ not json';

const entries = [
  { name: 'broken', raw: brokenRaw },
  { name: 'bad', raw: invalidRaw },
  { name: 'good', raw: validRaw },
];

/**
 * Stub store that deliberately makes `list` lossy (empty) while `readAllRaw`
 * sees every file, proving `verifyAll` does not depend on `list`.
 */
const stubLayer: Layer.Layer<PromptStore.PromptStore> = Layer.succeed(
  PromptStore.PromptStore,
  PromptStore.PromptStore.of({
    list: () => Effect.succeed([]),
    remove: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
    save: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
    readRaw: (_cwd: string, name: string) => {
      const entry = entries.find((candidate) => candidate.name === name);
      return entry === undefined
        ? Effect.fail(new PromptStore.StoreError({ message: `Unknown prompt '${name}'.` }))
        : Effect.succeed(entry.raw);
    },
    readAllRaw: () => Effect.succeed(entries.map(({ name, raw }) => ({ name, raw }))),
  }),
);

const run = () => Engines.verifyAll({ cwd: '/repo' }).pipe(Effect.provide(stubLayer));

Vitest.describe('Engines.verifyAll', () => {
  Vitest.it.effect('reports corrupt and invalid files that list would drop', () =>
    Effect.gen(function* () {
      const report = yield* run();
      Vitest.expect(report.entries.map((entry) => entry.name)).toStrictEqual([
        'broken',
        'bad',
        'good',
      ]);
      Vitest.expect(
        report.entries.filter((entry) => !entry.result.valid).map((entry) => entry.name),
      ).toStrictEqual(['broken', 'bad']);
      Vitest.expect(report.issueCount).toBeGreaterThan(0);
    }),
  );

  Vitest.it.effect('renders a failing summary naming each bad prompt, not the passing one', () =>
    Effect.gen(function* () {
      const report = yield* run();
      const text = Renderers.verifyAll(report);
      Vitest.expect(text).toContain('broken:');
      Vitest.expect(text).toContain('bad:');
      Vitest.expect(text).not.toContain('good:');
      Vitest.expect(text).toContain('3 prompts');
    }),
  );

  Vitest.it.effect('prints a passing prompt only under verbose', () =>
    Effect.gen(function* () {
      const report = yield* run();
      Vitest.expect(Renderers.verifyAll(report, { verbose: true })).toContain('good:');
    }),
  );
});
