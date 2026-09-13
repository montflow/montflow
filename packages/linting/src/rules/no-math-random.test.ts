import { RuleTester } from 'oxlint/plugins-dev';

import { noMathRandomRule } from './no-math-random.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-math-random', noMathRandomRule, {
  valid: [
    'const program = Random.next;',
    'function pick(Math: { random(): number }) { return Math.random(); }',
    'const floored = Math.floor(value);',
  ],
  invalid: [
    {
      code: 'const id = Math.random();',
      errors: [{ messageId: 'mathRandom' }],
    },
  ],
});
