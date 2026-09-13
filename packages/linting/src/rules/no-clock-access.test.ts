import { RuleTester } from 'oxlint/plugins-dev';

import { noClockAccessRule } from './no-clock-access.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-clock-access', noClockAccessRule, {
  valid: [
    'const now = Effect.runSync(Clock.currentTimeMillis);',
    'function elapsed(Date: { now(): number }) { return Date.now(); }',
    'const deadline = Duration.fromMillis(1000);',
    'const stamp = new Date(millis).toISOString();',
  ],
  invalid: [
    {
      code: 'const start = Date.now();',
      errors: [{ messageId: 'clockAccess', data: { expression: 'Date.now()' } }],
    },
    {
      code: 'const when = new Date();',
      errors: [{ messageId: 'clockAccess', data: { expression: 'new Date()' } }],
    },
  ],
});
