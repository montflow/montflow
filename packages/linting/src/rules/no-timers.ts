import { defineRule } from '@oxlint/plugins';

import { isGlobalIdentifier } from '../shared/effect-services.ts';

const TIMER_FUNCTIONS = new Set(['setTimeout', 'setInterval', 'clearTimeout', 'clearInterval']);

/** Delay and poll with Effect/Schedule on Clock instead of raw timers. */
export const noTimersRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow setTimeout/setInterval/clearTimeout/clearInterval; use Effect.sleep or Schedule.',
    },
    messages: {
      timers:
        'Do not use {{name}} directly — raw timers run outside Clock and cannot be controlled in tests. Use Effect.sleep with a Duration, or Schedule with Effect.retry/repeat, so timing runs on Clock and tests use TestClock.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Super' || node.callee.type === 'V8IntrinsicExpression') return;

        if (node.callee.type === 'Identifier') {
          if (!TIMER_FUNCTIONS.has(node.callee.name)) return;
          if (!isGlobalIdentifier(context.sourceCode, node.callee, node.callee.name)) return;
          context.report({
            node: node.callee,
            messageId: 'timers',
            data: { name: node.callee.name },
          });
          return;
        }

        if (node.callee.type === 'MemberExpression' && !node.callee.computed) {
          const { object, property } = node.callee;
          if (!isGlobalIdentifier(context.sourceCode, object, 'globalThis')) return;
          if (
            property.type !== 'Identifier' ||
            !('name' in property) ||
            !TIMER_FUNCTIONS.has(property.name)
          ) {
            return;
          }
          context.report({
            node: node.callee,
            messageId: 'timers',
            data: { name: property.name },
          });
        }
      },
    };
  },
});
