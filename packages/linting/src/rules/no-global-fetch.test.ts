import { RuleTester } from 'oxlint/plugins-dev';

import { noGlobalFetchRule } from './no-global-fetch.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-global-fetch', noGlobalFetchRule, {
  valid: [
    "const program = HttpClient.get('/users');",
    "function load(fetch: (url: string) => Promise<Response>) { return fetch('/users'); }",
    "const client = { fetch(url) {} }; client.fetch('/users');",
  ],
  invalid: [
    {
      code: "const response = await fetch('/users');",
      errors: [{ messageId: 'globalFetch' }],
    },
    {
      code: "const response = await globalThis.fetch('/users');",
      errors: [{ messageId: 'globalFetch' }],
    },
  ],
});
