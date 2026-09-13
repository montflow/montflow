import { defineRule } from '@oxlint/plugins';

import type { ESTree } from '@oxlint/plugins';

/**
 * Whether the call is a plain `.pipe(...)` invocation: a non-computed
 * `pipe` member access with no optional chaining and no explicit type
 * arguments.
 */
function isPipeCall(node: ESTree.CallExpression): node is ESTree.CallExpression & {
  callee: ESTree.StaticMemberExpression;
} {
  if (node.optional) return false;
  if (node.typeArguments !== undefined && node.typeArguments !== null) return false;
  const { callee } = node;
  if (callee.type !== 'MemberExpression' || callee.computed) return false;
  const { property } = callee;
  return property.type === 'Identifier' && 'name' in property && property.name === 'pipe';
}

/**
 * Merge chained pipes into a single pipe: `a.pipe(b).pipe(c)` becomes
 * `a.pipe(b, c)`.
 *
 * A split chain is usually fallout from an incremental edit (or from the
 * `no-data-first-effect` autofix landing one pipe per pass) — the steps
 * belong to one chain and should read in one place. Only targets
 * Effect-style associative `pipe` (value plus functions), the only `.pipe`
 * shape in code that passes the montflow rules; Node-style single-shot
 * `stream.pipe(destination)` chains never merge this way.
 *
 * Optional chains (`a?.pipe(b).pipe(c)`, `a.pipe(b)?.pipe(c)`) and explicit
 * type arguments (`.pipe<T>(...)`) are left alone — merging those would
 * change short-circuiting or drop type arguments.
 */
export const noChainedPipeRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow chained .pipe calls; merge them into a single pipe instead.',
    },
    fixable: 'code',
    messages: {
      chainedPipe:
        'Do not chain .pipe calls — a.pipe(b).pipe(c) splits one chain across two pipes. Merge into a single pipe: a.pipe(b, c) so the whole chain reads in one place.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (!isPipeCall(node)) return;
        if (node.parent.type === 'ChainExpression') return;
        const { object } = node.callee;
        if (object.type !== 'CallExpression' || !isPipeCall(object)) return;

        const receiver = context.sourceCode.getText(object.callee.object);
        const args = [...object.arguments, ...node.arguments]
          .map((arg) => context.sourceCode.getText(arg))
          .join(', ');
        const replacement = `${receiver}.pipe(${args})`;

        context.report({
          node: node.callee,
          messageId: 'chainedPipe',
          fix: (fixer) => fixer.replaceText(node, replacement),
        });
      },
    };
  },
});
