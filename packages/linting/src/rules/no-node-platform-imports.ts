import { defineRule } from '@oxlint/plugins';

import { isTestFile, platformSuggestion } from '../shared/effect-services.ts';

import type { ESTree } from '@oxlint/plugins';

/** Route Node.js platform imports through Effect services instead of bypassing them. */
export const noNodePlatformImportsRule = defineRule({
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow all node:* platform imports outside test files; use the corresponding Effect service.',
    },
    messages: {
      platformImport:
        'Do not import "{{module}}" directly. Use {{suggestion}} and provide the platform layer at the composition root. Only the composition root may touch platform modules — suppress this rule there with a justification.',
    },
  },
  create(context) {
    if (isTestFile(context.filename)) return {};

    const report = (source: ESTree.StringLiteral): void => {
      const suggestion = platformSuggestion(source.value);
      if (suggestion === null) return;
      context.report({
        node: source,
        messageId: 'platformImport',
        data: { module: source.value, suggestion },
      });
    };

    return {
      ImportDeclaration(node) {
        report(node.source);
      },
      ExportNamedDeclaration(node) {
        if (node.source !== null) report(node.source);
      },
      ExportAllDeclaration(node) {
        report(node.source);
      },
      ImportExpression(node) {
        // oxlint-disable-next-line anti-slop/no-runtime-typeof -- dynamic import sources are statically strings by grammar; the check only narrows the AST union.
        if (node.source.type === 'Literal' && typeof node.source.value === 'string') {
          report(node.source);
        }
      },
    };
  },
});
