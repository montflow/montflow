import type { ESTree, Scope, SourceCode } from '@oxlint/plugins';

const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const TESTS_DIR = /(^|\/)__(tests?)__\//u;
const SRC_TESTS_DIR = /(^|\/)tests?\//u;

/** Test files and files under tests/ directories may use platform APIs for fixtures. */
export function isTestFile(filename: string): boolean {
  const normalized = filename.replaceAll('\\', '/');
  return TEST_FILE.test(normalized) || TESTS_DIR.test(normalized) || SRC_TESTS_DIR.test(normalized);
}

const NODE_PREFIX = 'node:';

/** Node.js builtin module (without `node:` prefix) to the Effect service that replaces it. */
const PLATFORM_MODULE_SUGGESTIONS = new Map<string, string>([
  ['fs', 'FileSystem'],
  ['fs/promises', 'FileSystem'],
  ['path', 'Path'],
  ['path/posix', 'Path'],
  ['path/win32', 'Path'],
  ['child_process', 'Command'],
  [
    'os',
    'a Context service you own (Effect has no OS service — isolate it behind an injectable Tag)',
  ],
]);

/** Strip the `node:` prefix so `node:fs` and `fs` resolve to the same builtin. */
export function normalizeBuiltin(source: string): string {
  return source.startsWith(NODE_PREFIX) ? source.slice(NODE_PREFIX.length) : source;
}

/**
 * The Effect-side replacement for a Node.js builtin import, or null when
 * the import is not a platform module.
 *
 * Every `node:`-prefixed import is prohibited: known modules map to their
 * Effect service, anything else gets the generic replacement. Bare
 * specifiers only match the known list — an unprefixed name can also be an
 * npm package, so those stay out of scope.
 */
export function platformSuggestion(source: string): string | null {
  const known = PLATFORM_MODULE_SUGGESTIONS.get(normalizeBuiltin(source));
  if (known !== undefined) return known;
  if (source.startsWith(NODE_PREFIX)) {
    return 'the corresponding Effect service, or a Context service you own when Effect has none';
  }
  return null;
}

/**
 * Whether an identifier with the given name resolves to the runtime global.
 *
 * `isGlobalReference` only recognizes declared globals (e.g. via `env`);
 * an unresolvable name also falls through to the runtime global scope, so
 * treat it as global unless a local scope owns the binding. Same fallback
 * shape as anti-slop's test-framework-object resolution.
 */
export function isGlobalIdentifier(
  sourceCode: SourceCode,
  node: ESTree.Node,
  name: string,
): boolean {
  if (node.type !== 'Identifier' || node.name !== name) return false;
  if (sourceCode.isGlobalReference(node)) return true;
  let scope: Scope | null = sourceCode.getScope(node);
  while (scope !== null) {
    if (scope.set.has(name)) return false;
    scope = scope.upper;
  }
  return true;
}
