import { defineRule } from '@oxlint/plugins';

import { isGlobalIdentifier } from '../shared/effect-services.ts';

/** Read wall-clock time through Clock instead of Date. */
export const noClockAccessRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow Date.now() and new Date(); read time through the Clock service.',
    },
    messages: {
      clockAccess:
        'Do not read the wall clock with {{expression}} — it cannot be controlled in tests. Use Clock (Clock.currentTimeMillis) so tests drive time with TestClock.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type !== 'MemberExpression' || node.callee.computed) return;
        const { object, property } = node.callee;
        if (!isGlobalIdentifier(context.sourceCode, object, 'Date')) return;
        if (property.type !== 'Identifier' || !('name' in property) || property.name !== 'now') {
          return;
        }
        context.report({
          node: node.callee,
          messageId: 'clockAccess',
          data: { expression: 'Date.now()' },
        });
      },
      NewExpression(node) {
        // new Date(millis) is a pure timestamp conversion; only the
        // zero-argument form reads the wall clock.
        if (node.arguments.length > 0) return;
        if (!isGlobalIdentifier(context.sourceCode, node.callee, 'Date')) return;
        context.report({
          node: node.callee,
          messageId: 'clockAccess',
          data: { expression: 'new Date()' },
        });
      },
    };
  },
});
