import { defineRule } from '@oxlint/plugins';

import type { ESTree } from '@oxlint/plugins';

function unwrapChain(
  expression: ESTree.Expression | ESTree.Super,
): ESTree.Expression | ESTree.Super {
  let current = expression;
  while (current.type === 'ChainExpression') {
    current = current.expression;
  }
  return current;
}

/** Branch on tagged unions with Match instead of switch on _tag. */
export const noSwitchOnTagRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow switch statements on a _tag discriminant; use Match with exhaustive handling.',
    },
    messages: {
      switchOnTag:
        'Do not switch on _tag — a hand-rolled switch reimplements pattern matching without exhaustiveness checking. Use Match with exhaustive handling so a new variant fails at compile time.',
    },
  },
  create(context) {
    return {
      SwitchStatement(node) {
        const discriminant = unwrapChain(node.discriminant);
        if (discriminant.type !== 'MemberExpression' || discriminant.computed) return;
        const { property } = discriminant;
        if (property.type !== 'Identifier' || property.name !== '_tag') return;
        context.report({ node: discriminant, messageId: 'switchOnTag' });
      },
    };
  },
});
