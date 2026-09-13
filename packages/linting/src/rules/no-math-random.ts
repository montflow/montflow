import { defineRule } from '@oxlint/plugins';

import { isGlobalIdentifier } from '../shared/effect-services.ts';

/** Draw randomness from the Random service instead of Math.random(). */
export const noMathRandomRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Math.random(); draw randomness from the Random service.',
    },
    messages: {
      mathRandom:
        'Do not use Math.random() — it is unseedable global state. Use the Random service (Random.next) so tests control entropy with a test layer.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) return;
        const { object, property } = node.callee;
        if (!isGlobalIdentifier(context.sourceCode, object, 'Math')) return;
        if (property.type !== 'Identifier' || !('name' in property) || property.name !== 'random') {
          return;
        }
        context.report({ node: node.callee, messageId: 'mathRandom' });
      },
    };
  },
});
