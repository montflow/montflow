import { RuleTester } from 'oxlint/plugins-dev';

import { noChainedPipeRule } from './no-chained-pipe.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-chained-pipe', noChainedPipeRule, {
  valid: [
    // A single pipe is already merged.
    'const out = a.pipe(b, c);',
    'const out = effect.pipe(Effect.map(f), Effect.runPromise);',
    // Non-pipe chains are out of scope.
    'const out = promise.then(a).then(b);',
    'const out = stream.pipe(destination);',
    // Optional chaining short-circuits — merging would change semantics.
    'const out = a?.pipe(b).pipe(c);',
    'const out = a.pipe(b)?.pipe(c);',
    // Explicit type arguments cannot be merged textually.
    'const out = a.pipe<number>(b).pipe(c);',
  ],
  invalid: [
    {
      code: 'const out = a.pipe(b).pipe(c);',
      output: 'const out = a.pipe(b, c);',
      errors: [{ messageId: 'chainedPipe' }],
    },
    {
      // The no-data-first-effect composition case: one pipe per pass lands
      // here, this rule folds them back into a single pipe.
      code: "import { Effect } from 'effect'; const out = effect.pipe(Effect.map(f)).pipe(Effect.runPromise);",
      output:
        "import { Effect } from 'effect'; const out = effect.pipe(Effect.map(f), Effect.runPromise);",
      errors: [{ messageId: 'chainedPipe' }],
    },
    {
      // Longer chains are flagged per link; --fix multipass converges them
      // into one pipe one pass at a time.
      code: 'const out = a.pipe(b).pipe(c).pipe(d);',
      output: 'const out = a.pipe(b, c).pipe(d);',
      errors: [{ messageId: 'chainedPipe' }, { messageId: 'chainedPipe' }],
    },
  ],
});
