import { eslintCompatPlugin } from '@oxlint/plugins';

/**
 * Montflow oxlint plugin for custom lint rules.
 *
 * Add rules under `src/rules/` and register them here.
 * See vendored anti-slop at `tooling/oxlint/anti-slop/` for rule authoring
 * patterns (`defineRule` from `@oxlint/plugins`).
 */
const montflowPlugin = eslintCompatPlugin({
  meta: { name: 'montflow' },
  rules: {},
});

export default montflowPlugin;
