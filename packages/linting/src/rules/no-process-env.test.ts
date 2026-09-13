import { RuleTester } from 'oxlint/plugins-dev';

import { noProcessEnvRule } from './no-process-env.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-process-env', noProcessEnvRule, {
  valid: [
    "const config = Config.string('API_KEY');",
    'const env = process.argv;',
    'function run(process: { env: string }) { return process.env; }',
    "const settings = { env: 'production' }; return settings.env;",
  ],
  invalid: [
    {
      code: 'const key = process.env.API_KEY;',
      errors: [{ messageId: 'processEnv' }],
    },
    {
      code: "const key = process['env'];",
      errors: [{ messageId: 'processEnv' }],
    },
    {
      code: 'const { env } = process;',
      errors: [{ messageId: 'processEnv' }],
    },
  ],
});
