import { RuleTester } from 'oxlint/plugins-dev';

import { noTimersRule } from './no-timers.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-timers', noTimersRule, {
  valid: [
    "const program = Effect.sleep('100 millis');",
    "Effect.retry(effect, Schedule.exponential('100 millis'));",
    'function poll(setTimeout: (fn: () => void) => void) { setTimeout(run); }',
    'scheduler.setTimeout(run, 100);',
  ],
  invalid: [
    {
      code: 'setTimeout(run, 100);',
      errors: [{ messageId: 'timers', data: { name: 'setTimeout' } }],
    },
    {
      code: 'setInterval(poll, 1000);',
      errors: [{ messageId: 'timers', data: { name: 'setInterval' } }],
    },
    {
      code: 'clearTimeout(handle);',
      errors: [{ messageId: 'timers', data: { name: 'clearTimeout' } }],
    },
    {
      code: 'globalThis.setTimeout(run, 100);',
      errors: [{ messageId: 'timers', data: { name: 'setTimeout' } }],
    },
  ],
});
