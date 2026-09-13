import { defineRule } from '@oxlint/plugins';

import { isGlobalIdentifier } from '../shared/effect-services.ts';

/** Route HTTP through HttpClient instead of the global fetch. */
export const noGlobalFetchRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow the global fetch function; use the HttpClient service.',
    },
    messages: {
      globalFetch:
        'Do not call global fetch directly — it hides the transport outside the Effect layer graph. Use HttpClient and provide its layer at the composition root so transports stay explicit and testable.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === 'Super' || node.callee.type === 'V8IntrinsicExpression') return;

        if (node.callee.type === 'Identifier') {
          if (!isGlobalIdentifier(context.sourceCode, node.callee, 'fetch')) return;
          context.report({ node: node.callee, messageId: 'globalFetch' });
          return;
        }

        if (node.callee.type === 'MemberExpression') {
          const { object, property } = node.callee;
          if (!isGlobalIdentifier(context.sourceCode, object, 'globalThis')) return;
          const isFetch = node.callee.computed
            ? property.type === 'Literal' && 'value' in property && property.value === 'fetch'
            : property.type === 'Identifier' && 'name' in property && property.name === 'fetch';
          if (isFetch) {
            context.report({ node: node.callee, messageId: 'globalFetch' });
          }
        }
      },
    };
  },
});
