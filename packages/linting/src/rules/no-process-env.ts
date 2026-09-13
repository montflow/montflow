import { defineRule } from '@oxlint/plugins';

import { isGlobalIdentifier } from '../shared/effect-services.ts';

function isEnvProperty(node: { computed: boolean; property: { type: string } }): boolean {
  if (node.computed) {
    return (
      node.property.type === 'Literal' && 'value' in node.property && node.property.value === 'env'
    );
  }
  return (
    node.property.type === 'Identifier' && 'name' in node.property && node.property.name === 'env'
  );
}

/** Read configuration through Config instead of process.env. */
export const noProcessEnvRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow process.env access; read configuration through the Config service.',
    },
    messages: {
      processEnv:
        'Do not read process.env directly — it hides configuration as untyped global state. Use Config (e.g. Config.string) and provide a ConfigProvider, so tests swap values without touching the environment.',
    },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (!isGlobalIdentifier(context.sourceCode, node.object, 'process')) return;
        if (!isEnvProperty(node)) return;
        context.report({ node, messageId: 'processEnv' });
      },
      VariableDeclarator(node) {
        if (node.init === null || node.init === undefined) return;
        if (!isGlobalIdentifier(context.sourceCode, node.init, 'process')) return;
        if (node.id.type !== 'ObjectPattern') return;
        const destructuresEnv = node.id.properties.some(
          (property) =>
            property.type === 'Property' &&
            !property.computed &&
            property.key.type === 'Identifier' &&
            property.key.name === 'env',
        );
        if (destructuresEnv) {
          context.report({ node: node.id, messageId: 'processEnv' });
        }
      },
    };
  },
});
