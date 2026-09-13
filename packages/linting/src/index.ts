import { eslintCompatPlugin } from '@oxlint/plugins';

import { noChainedPipeRule } from './rules/no-chained-pipe.ts';
import { noClockAccessRule } from './rules/no-clock-access.ts';
import { noDataFirstEffectRule } from './rules/no-data-first-effect.ts';
import { noGlobalFetchRule } from './rules/no-global-fetch.ts';
import { noMathRandomRule } from './rules/no-math-random.ts';
import { noNodePlatformImportsRule } from './rules/no-node-platform-imports.ts';
import { noProcessEnvRule } from './rules/no-process-env.ts';
import { noSwitchOnTagRule } from './rules/no-switch-on-tag.ts';
import { noTimersRule } from './rules/no-timers.ts';

/**
 * Montflow oxlint plugin for custom lint rules.
 *
 * These rules mechanically enforce the parts of the effect-reviewer profile
 * that do not need human judgment — platform services over raw imports and
 * Effect modules over hand-rolled branching. Anything requiring judgment
 * (error-boundary placement, retry idempotency, layer shape) stays with the
 * reviewer. See `.agents/@montflow/pi-profiles/effect-reviewer/PROFILE.md`.
 *
 * Add rules under `src/rules/` and register them here.
 * See vendored anti-slop at `tooling/oxlint/anti-slop/` for rule authoring
 * patterns (`defineRule` from `@oxlint/plugins`).
 */
const montflowPlugin = eslintCompatPlugin({
  meta: { name: 'montflow' },
  rules: {
    'no-chained-pipe': noChainedPipeRule,
    'no-clock-access': noClockAccessRule,
    'no-data-first-effect': noDataFirstEffectRule,
    'no-global-fetch': noGlobalFetchRule,
    'no-math-random': noMathRandomRule,
    'no-node-platform-imports': noNodePlatformImportsRule,
    'no-process-env': noProcessEnvRule,
    'no-switch-on-tag': noSwitchOnTagRule,
    'no-timers': noTimersRule,
  },
});

export default montflowPlugin;
