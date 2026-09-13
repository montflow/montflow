import { defineRule } from '@oxlint/plugins';

import type { Definition, ESTree, Scope, SourceCode } from '@oxlint/plugins';

/**
 * Effect members that take exactly one Effect and nothing else
 * (terminal runners and single-argument combinators). A call with exactly
 * one argument is always data-first: `Effect.runPromise(effect)`.
 */
const SINGLE_EFFECT_OPS = new Set([
  'runPromise',
  'runSync',
  'runFork',
  'runPromiseExit',
  'runSyncExit',
  'flip',
  'sandbox',
  'scoped',
  'option',
  'flatten',
  'transposeOption',
  'orDie',
]);

/**
 * Dual Effect combinators whose data-first form takes the effect plus
 * exactly one more argument: `Effect.map(effect, f)`. The curried
 * data-last form (`Effect.map(f)`, for use inside `pipe`) takes one fewer
 * argument, so argument count alone disambiguates the two.
 */
const DUAL_TWO_ARG_OPS = new Set([
  'map',
  'flatMap',
  'andThen',
  'tap',
  'tapError',
  'tapDefect',
  'mapError',
  'match',
  'matchEffect',
  'provide',
  'retry',
  'repeat',
  'timeout',
  'timeoutOption',
  'ensuring',
  'onError',
  'catchCause',
  'catchDefect',
  'catchTags',
  'orElseSucceed',
  'as',
]);

/**
 * Dual Effect combinators whose data-first form takes the effect plus two
 * more arguments: `Effect.catchTag(effect, tag, f)`.
 */
const DUAL_THREE_ARG_OPS = new Set([
  'catchTag',
  'catchIf',
  'provideService',
  'zipWith',
  'retryOrElse',
]);

/**
 * Dual Effect combinators with an optional trailing options argument:
 * `Effect.zip(a, b)` or `Effect.zip(a, b, options)`. The curried form with
 * options (`Effect.zip(that, options)`) is also two arguments, so a
 * two-argument call whose second argument is an object literal is treated
 * as the curried form and left alone.
 */
const DUAL_TWO_OR_THREE_ARG_OPS = new Set(['zip', 'race', 'raceFirst', 'withSpan']);

/**
 * Single-effect combinators that also accept a trailing options argument:
 * `Effect.forever(effect)` or `Effect.forever(effect, options)`. The
 * options-only curried form (`Effect.forever({ disableYield: true })`)
 * takes an object literal, so a single object-literal argument is left alone.
 */
const SINGLE_EFFECT_OR_OPTIONS_OPS = new Set(['forever']);

/** Whether the call shape is a data-first use of a pipeable Effect member. */
function isDataFirstCall(name: string, args: Array<ESTree.Argument>): boolean {
  if (SINGLE_EFFECT_OPS.has(name)) return args.length === 1;
  if (SINGLE_EFFECT_OR_OPTIONS_OPS.has(name)) {
    if (args.length === 2) return true;
    return args.length === 1 && args[0]?.type !== 'ObjectExpression';
  }
  if (DUAL_TWO_ARG_OPS.has(name)) return args.length === 2;
  if (DUAL_THREE_ARG_OPS.has(name)) return args.length === 3;
  if (DUAL_TWO_OR_THREE_ARG_OPS.has(name)) {
    if (args.length === 3) return true;
    // Effect.zip(that, options) is the curried form — only flag a
    // two-argument call when the second argument is not an options object.
    return args.length === 2 && args[1]?.type !== 'ObjectExpression';
  }
  return false;
}

/**
 * Whether an identifier refers to the `Effect` namespace of the `effect`
 * module. Aliased imports (`import { Effect as Fx }`) resolve through the
 * scope chain; any other import from the module (`Layer`, `Stream`, ...) or
 * a locally shadowed name (parameter, variable) does not. An unresolvable
 * name is assumed to be the module when it is literally `Effect`, matching
 * the fallback in `isGlobalIdentifier`.
 */
function isEffectNamespace(sourceCode: SourceCode, node: ESTree.Node, name: string): boolean {
  if (node.type !== 'Identifier' || node.name !== name) return false;
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    const variable = scope.set.get(name);
    if (variable !== undefined) {
      return variable.defs.some((def: Definition) => isEffectImport(def));
    }
    scope = scope.upper;
  }
  return name === 'Effect';
}

/** Whether a scope definition is the `Effect` named import from `effect`. */
function isEffectImport(def: Definition): boolean {
  if (def.type !== 'ImportBinding') return false;
  const { parent, node } = def;
  if (parent?.type !== 'ImportDeclaration') return false;
  if (parent.source.value !== 'effect' && !parent.source.value.startsWith('effect/')) {
    return false;
  }
  // import { Effect } / import { Effect as Fx } — but not Layer, Stream, ...
  return (
    node.type === 'ImportSpecifier' &&
    (node.imported.type === 'Identifier'
      ? node.imported.name === 'Effect'
      : node.imported.value === 'Effect')
  );
}

/** Whether the value can precede `.pipe` without wrapping parentheses. */
function needsParens(node: ESTree.Argument): boolean {
  const unwrapped =
    node.type === 'ChainExpression' || node.type === 'ParenthesizedExpression'
      ? node.expression
      : node;
  return (
    unwrapped.type !== 'Identifier' &&
    unwrapped.type !== 'CallExpression' &&
    unwrapped.type !== 'MemberExpression'
  );
}

/**
 * Prefer `effect.pipe(Effect.op(...))` over data-first `Effect.op(effect, ...)`.
 *
 * Data-first calls nest inside-out (`a(b(c()))`); the pipe form reads the
 * chain top-to-bottom. Only flags curated Effect members whose data-first
 * first argument is always an Effect — constructors (`succeed`, `fail`,
 * `gen`, `sync`) and Iterable-taking combinators (`forEach`, `all`) are
 * out of scope. The curried data-last form used inside `pipe`
 * (`Effect.map(f)`) takes fewer arguments and is never flagged.
 */
export const noDataFirstEffectRule = defineRule({
  meta: {
    type: 'suggestion',
    docs: {
      description: 'Disallow data-first Effect calls; move the effect into pipe instead.',
    },
    fixable: 'code',
    messages: {
      dataFirst:
        'Do not call {{namespace}}.{{name}} with the effect as the first argument — nested data-first calls read inside-out. Use effect.pipe({{namespace}}.{{name}}(...)) so the chain reads top-to-bottom.',
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        const { callee } = node;
        if (callee.type !== 'MemberExpression' || callee.computed) return;
        const { object, property } = callee;
        if (object.type !== 'Identifier') return;
        if (property.type !== 'Identifier' || !('name' in property)) return;
        const name = property.name;
        if (!isDataFirstCall(name, node.arguments)) return;
        if (!isEffectNamespace(context.sourceCode, object, object.name)) return;
        // A spread first argument cannot be moved into pipe textually.
        if (node.arguments.some((arg) => arg.type === 'SpreadElement')) return;

        const [first, ...rest] = node.arguments;
        if (first === undefined) return;
        const namespace = context.sourceCode.getText(object);
        const receiver = needsParens(first)
          ? `(${context.sourceCode.getText(first)})`
          : context.sourceCode.getText(first);
        const restText = rest.map((arg) => context.sourceCode.getText(arg)).join(', ');
        const replacement =
          rest.length === 0
            ? `${receiver}.pipe(${namespace}.${name})`
            : `${receiver}.pipe(${namespace}.${name}(${restText}))`;

        context.report({
          node: callee,
          messageId: 'dataFirst',
          data: { namespace, name },
          fix: (fixer) => fixer.replaceText(node, replacement),
        });
      },
    };
  },
});
