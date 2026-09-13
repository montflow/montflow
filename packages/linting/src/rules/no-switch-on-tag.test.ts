import { RuleTester } from 'oxlint/plugins-dev';

import { noSwitchOnTagRule } from './no-switch-on-tag.ts';

const tester = new RuleTester({ languageOptions: { parserOptions: { lang: 'ts' } } });

tester.run('montflow/no-switch-on-tag', noSwitchOnTagRule, {
  valid: [
    "switch (status) { case 'ok': break; }",
    "switch (event.kind) { case 'click': break; }",
    "const result = Match.value(event).pipe(Match.tag('Ok', () => 1), Match.orElse(() => 0));",
  ],
  invalid: [
    {
      code: "switch (event._tag) { case 'Ok': break; }",
      errors: [{ messageId: 'switchOnTag' }],
    },
    {
      code: "switch (event?._tag) { case 'Ok': break; }",
      errors: [{ messageId: 'switchOnTag' }],
    },
  ],
});
