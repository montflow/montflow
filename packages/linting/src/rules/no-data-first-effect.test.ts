import { RuleTester } from 'oxlint/plugins-dev';

import { noDataFirstEffectRule } from './no-data-first-effect.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-data-first-effect', noDataFirstEffectRule, {
  valid: [
    // Pipe form — the effect is already the receiver.
    "import { Effect } from 'effect'; const out = effect.pipe(Effect.map((n) => n + 1));",
    "import { Effect } from 'effect'; const out = effect.pipe(Effect.map((n) => n + 1), Effect.runPromise);",
    // Curried data-last form used inside pipe takes fewer arguments.
    "import { Effect } from 'effect'; const op = Effect.map((n: number) => n + 1);",
    "import { Effect } from 'effect'; const op = Effect.catchTag('Tag', () => Effect.succeed(0));",
    // Constructors and Iterable-taking combinators are out of scope.
    "import { Effect } from 'effect'; const out = Effect.succeed(42);",
    "import { Effect } from 'effect'; const out = Effect.fail('boom');",
    "import { Effect } from 'effect'; const out = Effect.forEach(entries, (entry) => read(entry));",
    "import { Effect } from 'effect'; const out = Effect.all([a, b]);",
    // Curried-with-options form: second argument is an options object.
    "import { Effect } from 'effect'; const out = run(Effect.zip(that, { concurrent: 2 }));",
    // Options-only curried form of an options-taking combinator.
    "import { Effect } from 'effect'; const op = Effect.forever({ disableYield: true });",
    // A locally shadowed Effect is not the module.
    'function run(Effect: { runPromise(effect: unknown): void }, effect: unknown) { Effect.runPromise(effect); }',
    // Other effect-module namespaces share the import source but are not Effect.
    "import { Layer } from 'effect'; const Live = Layer.provide(ProfileStore.Default, NodeLive);",
    // Global pipe with the curried form is already piped style.
    "import { Effect, pipe } from 'effect'; const out = pipe(effect, Effect.map((n) => n + 1));",
  ],
  invalid: [
    {
      code: "import { Effect } from 'effect'; const out = Effect.runPromise(effect);",
      output: "import { Effect } from 'effect'; const out = effect.pipe(Effect.runPromise);",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'runPromise' } }],
    },
    {
      code: "import { Effect } from 'effect'; const out = Effect.map(effect, (n) => n + 1);",
      output: "import { Effect } from 'effect'; const out = effect.pipe(Effect.map((n) => n + 1));",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'map' } }],
    },
    {
      // Nested data-first calls: both calls are flagged; --fix multipass
      // flattens them into a single pipe one pass at a time.
      code: "import { Effect } from 'effect'; const out = Effect.runPromise(Effect.map(effect, (n) => n + 1));",
      output:
        "import { Effect } from 'effect'; const out = Effect.map(effect, (n) => n + 1).pipe(Effect.runPromise);",
      errors: [
        { messageId: 'dataFirst', data: { namespace: 'Effect', name: 'runPromise' } },
        { messageId: 'dataFirst', data: { namespace: 'Effect', name: 'map' } },
      ],
    },
    {
      code: "import { Effect } from 'effect'; const out = Effect.catchTag(effect, 'Tag', () => Effect.succeed(0));",
      output:
        "import { Effect } from 'effect'; const out = effect.pipe(Effect.catchTag('Tag', () => Effect.succeed(0)));",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'catchTag' } }],
    },
    {
      // Non-atomic receiver needs parentheses to keep the pipe on the value.
      code: "import { Effect } from 'effect'; function* gen() { const out = Effect.runSync(yield* load()); }",
      output:
        "import { Effect } from 'effect'; function* gen() { const out = (yield* load()).pipe(Effect.runSync); }",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'runSync' } }],
    },
    {
      // Aliased import resolves through the scope chain.
      code: "import { Effect as Fx } from 'effect'; const out = Fx.flip(effect);",
      output: "import { Effect as Fx } from 'effect'; const out = effect.pipe(Fx.flip);",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Fx', name: 'flip' } }],
    },
    {
      code: "import { Effect } from 'effect'; const out = Effect.zip(a, b);",
      output: "import { Effect } from 'effect'; const out = a.pipe(Effect.zip(b));",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'zip' } }],
    },
    {
      code: "import { Effect } from 'effect'; const out = Effect.forever(effect);",
      output: "import { Effect } from 'effect'; const out = effect.pipe(Effect.forever);",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'forever' } }],
    },
    {
      code: "import { Effect } from 'effect'; const out = Effect.forever(effect, { disableYield: true });",
      output:
        "import { Effect } from 'effect'; const out = effect.pipe(Effect.forever({ disableYield: true }));",
      errors: [{ messageId: 'dataFirst', data: { namespace: 'Effect', name: 'forever' } }],
    },
  ],
});
