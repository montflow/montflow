import Handlebars from 'handlebars';

/**
 * The one place templates are parsed and rendered. Wraps Handlebars with a
 * deliberately tiny grammar (see {@link GRAMMAR}) and a mechanical analysis
 * pass ({@link inspect}) so the prompt verifier can check a template instead
 * of guessing at it with a regex.
 *
 * The wrapper earns its keep in three ways:
 *
 * 1. **A closed grammar.** Only `{{name}}`, `{{#if}}`, `{{#unless}}`,
 *    `{{else}}`, and `{{! comments }}` are accepted. Handlebars ships ~30
 *    more constructs (`{{#each}}`, `{{lookup}}`, subexpressions, partials,
 *    `{{#with}}`); each one would add a case the verifier has to reason
 *    about, and a prompt is a flat bag of strings, not a data structure.
 * 2. **Total verification.** {@link inspect} returns every problem at once
 *    (syntax, unknown helper, dotted path, data variable) instead of throwing
 *    on the first one, so `verify` can hand an author the full list.
 * 3. **Render options that suit prompts.** Handlebars HTML-escapes by
 *    default, which would turn `a && b` into `a &amp;&amp; b` in the text sent
 *    to an agent. {@link RENDER_OPTIONS} turns that off.
 */

/** Block helpers a template may open. Everything else is a verification error. */
export const ALLOWED_BLOCKS: ReadonlySet<string> = new Set(['if', 'unless']);

/**
 * A private Handlebars instance. A dedicated one (rather than the global
 * `Handlebars`) means a helper another extension registers on the global
 * cannot leak into prompt rendering. Prototype access is already denied:
 * Handlebars' proto-access whitelist hard-blocks `__proto__` and
 * `constructor`, and both `allowProto*ByDefault` flags default to falsy
 * (see `lib/handlebars/internal/proto-access.js`). {@link inspect}
 * additionally rejects `{{@…}}` and dotted paths, so the only way in is a
 * literal `{{constructor}}`, which renders empty — see `render.test.ts`.
 */
const engine = Handlebars.create();

/**
 * Render options applied to every `compile` call.
 *
 * - `noEscape` — prompts are plain text, not HTML; escaping corrupts them.
 * - `strict` — stays off. Strict mode throws on *any* unresolved reference
 *   even inside an untaken branch, which would make `{{#if a}}{{b}}{{/if}}`
 *   fail whenever `b` is absent. {@link buildContext} instead guarantees a
 *   total context from the variable schema, which is the check we want.
 */
export const RENDER_OPTIONS: CompileOptions = { noEscape: true, strict: false };

/** A variable name usable as a Handlebars path segment and as a JSON key. */
export const VARIABLE_NAME_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * The slice of the Handlebars AST this module reads. Handlebars' own types
 * describe every node kind and every builder field; narrowing them to the
 * handful actually consulted keeps {@link inspect} honest about what it
 * depends on, and means the rest of the module works against a named
 * contract instead of a dictionary.
 */
interface AstPath {
  /** `PathExpression`, `SubExpression`, `Identifier`, … */
  readonly type: string;
  /** Source text of the path — `a`, `a.b`, `../a`, `@index`. */
  readonly original: string;
  /** Path segments — `['a']` for `a`, `['a', 'b']` for `a.b`. */
  readonly parts: readonly string[];
  /** `0` for a local path, `>0` for a parent-context reach. */
  readonly depth: number;
}

/** Source position of a node, when Handlebars recorded one. */
interface AstLoc {
  readonly start?: { readonly line?: number } | undefined;
}

/**
 * One AST node. `body` holds a node's own children, while `program` and
 * `inverse` are `Program` wrappers around the then/else children of a block.
 */
interface AstNode {
  /** `Program`, `BlockStatement`, `MustacheStatement`, `ContentStatement`, `CommentStatement`, … */
  readonly type: string;
  readonly loc?: AstLoc | undefined;
  readonly path?: AstPath | undefined;
  readonly params?: readonly AstPath[] | undefined;
  readonly body?: readonly AstNode[] | undefined;
  readonly program?: AstNode | undefined;
  readonly inverse?: AstNode | undefined;
}

/** One problem found in a template, with enough context to fix it. */
export interface TemplateIssue {
  /** Machine-checkable kind, so callers can branch without string matching. */
  readonly kind:
    | 'syntax'
    | 'disallowed-block'
    | 'disallowed-param'
    | 'dotted-path'
    | 'data-variable'
    | 'invalid-name'
    | 'block-param-count';
  /** One-line description. */
  readonly message: string;
  /** 1-based line in the template, when known. */
  readonly line: number | undefined;
  /** Concrete instruction for the author. */
  readonly fix: string;
}

/** Variable references, split by how the template uses them. */
export interface TemplateAnalysis {
  /**
   * Every name the template mentions, in first-appearance order, whether it
   * is substituted or guards a branch. This is the order `variables` must
   * follow.
   */
  readonly variables: readonly string[];
  /** Names used in `{{name}}` position, first-appearance order. */
  readonly references: readonly string[];
  /** Names tested by an `{{#if}}` / `{{#unless}}` guard, first-appearance order. */
  readonly conditionals: readonly string[];
  /** Every problem found. Empty when the template is clean. */
  readonly issues: readonly TemplateIssue[];
}

/** Thrown-shaped failure of {@link render}: a template that will not render. */
export class TemplateRenderError extends Error {
  constructor(
    message: string,
    /** The underlying Handlebars error, for diagnostics. */
    override readonly cause: unknown,
  ) {
    super(message);
    this.name = 'TemplateRenderError';
  }
}

/** The prose grammar handed to prompt authors. Kept next to the parser that enforces it. */
export const GRAMMAR = `Handlebars, restricted to five constructs:

  {{name}}              substitute the variable's value
  {{! note }}           comment — not rendered
  {{#if name}}…{{/if}}  include the block when the value is non-empty
  {{#unless name}}…{{/unless}}
  {{else}}              alternative branch of the enclosing if/unless
  {{else if name}}      chained branch
  {{~ … ~}}             strip surrounding whitespace/newlines

Everything else is rejected: no {{#each}}, no {{#with}}, no subexpressions
like {{#if (eq a b)}}, no dotted paths like {{user.name}}, no {{@index}}, no
partials {{> x}}, no helpers, no custom filters.

A conditional tests the variable's effective value: what the user supplied,
or the variable's "default" when the user left the field blank, or empty when
there is neither. So a variable with "default": "" is false by default and
takes the {{else}} branch — that is how "if the user gave me a scope, use it,
otherwise do X" is written. A variable with a non-empty "default" is truthy by
default, so guard it with {{#if}} only when you want that default suppressed.`;

/**
 * True when `name` is a legal variable name: a flat, non-reserved Handlebars
 * path segment. Dots and hyphens are rejected — `{{user.name}}` would make
 * `user.name` a *path* into a nested object, and `{{my-var}}` is a parse
 * error, neither of which a flat string variable can express.
 * @param name - candidate variable name
 * @returns true when the name is a legal flat segment
 */
export const isValidVariableName = (name: string): boolean => VARIABLE_NAME_PATTERN.test(name);

const issue = (
  kind: TemplateIssue['kind'],
  message: string,
  line: number | undefined,
  fix: string,
): TemplateIssue => ({ kind, message, line, fix });

/** Line of a node in the original template, when Handlebars recorded one. */
const lineOf = (node: AstNode): number | undefined => node.loc?.start?.line;

/** A helper call like `{{eq a b}}` or `{{#if (eq a b)}}` — no helpers are allowed. */
const isSubExpression = (path: AstPath | undefined): boolean =>
  path !== undefined && path.type === 'SubExpression';

/** Append `name` to `into` unless it is already there, preserving order. */
const record = (into: string[], name: string): void => {
  if (!into.includes(name)) into.push(name);
};

/** Best-effort legal name from arbitrary text, so a `fix` line is actionable. */
const slugVariableName = (raw: string): string => {
  const cleaned = raw.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[^a-zA-Z_]+/, '');
  return cleaned === '' ? 'value' : cleaned;
};

/** Source text of a mustache's path and params, for error messages. */
const renderPath = (path: AstPath | undefined, params: readonly AstPath[]): string =>
  [path?.original ?? '?', ...params.map((param) => param.original)].join(' ');

/** Classify a path that is not a plain local identifier. */
const pathProblem = (path: AstPath): TemplateIssue | undefined => {
  if (path.original.startsWith('@'))
    return issue(
      'data-variable',
      `'{{${path.original}}}' is a Handlebars data variable, which is not available here.`,
      undefined,
      'Use a plain declared variable instead of a data variable.',
    );
  if (path.depth > 0)
    return issue(
      'dotted-path',
      `'{{${path.original}}}' reaches into a parent context, which does not exist here.`,
      undefined,
      'Declare a single flat name and pass it as a string.',
    );
  if (path.parts.length > 1)
    return issue(
      'dotted-path',
      `'{{${path.original}}}' is a dotted path, so Handlebars would read a nested object.`,
      undefined,
      `Declare a single flat name (use '${path.parts.join('_')}') and pass it as a string.`,
    );
  if (!isValidVariableName(path.original))
    return issue(
      'invalid-name',
      `'{{${path.original}}}' is not a usable variable name.`,
      undefined,
      `Rename it to match [a-zA-Z_][a-zA-Z0-9_]* (for example '${slugVariableName(path.original)}').`,
    );
  return undefined;
};

/** Accumulates names and problems while walking the tree, in source order. */
interface WalkState {
  readonly variables: string[];
  readonly references: string[];
  readonly conditionals: string[];
  readonly issues: TemplateIssue[];
}

/** A `{{name}}` statement. Records a reference, or a helper-call problem. */
const visitMustache = (node: AstNode, state: WalkState): void => {
  const path = node.path;
  if (path === undefined) return;
  const params = node.params ?? [];
  if (isSubExpression(path) || params.length > 0) {
    state.issues.push(
      issue(
        'disallowed-param',
        `'{{${renderPath(path, params)}}}' is a helper call, and no helpers are allowed.`,
        lineOf(node),
        `Substitute the value directly: {{${path.original}}}. To vary the text, wrap it in {{#if …}}…{{/if}}.`,
      ),
    );
    return;
  }
  const problem = pathProblem(path);
  if (problem !== undefined) state.issues.push(problem);
  else {
    record(state.variables, path.original);
    record(state.references, path.original);
  }
};

/** An `{{#…}}` block. Only `if`/`unless` with one flat name is allowed. */
const visitBlock = (node: AstNode, state: WalkState): boolean => {
  const name = node.path?.original ?? '';
  const params = node.params ?? [];
  if (!ALLOWED_BLOCKS.has(name)) {
    state.issues.push(
      issue(
        'disallowed-block',
        `{{#${name}}} is not allowed.`,
        lineOf(node),
        `Replace it with {{#if}} or {{#unless}}, for example {{#if ${params[0]?.original ?? 'name'}}}…{{/if}}.`,
      ),
    );
    return false;
  }
  if (params.length !== 1 || isSubExpression(params[0])) {
    state.issues.push(
      issue(
        'block-param-count',
        `{{#${name}}} takes exactly one variable, got ${params.length}.`,
        lineOf(node),
        `Write {{#${name} <name>}}…{{/${name}}} — comparisons are not supported, use a nested {{#if}}.`,
      ),
    );
    return false;
  }
  const param = params[0];
  if (param === undefined) return false;
  const problem = pathProblem(param);
  if (problem !== undefined) {
    state.issues.push(problem);
    return false;
  }
  record(state.variables, param.original);
  record(state.conditionals, param.original);
  return true;
};

/**
 * Depth-first walk, visiting a node then its children.
 *
 * A rejected block's body is skipped. Its statements belong to a construct
 * that will not exist once the author fixes the file, so treating `{{this}}`
 * inside a `{{#each}}` as a variable the prompt needs would put a name in the
 * fix-it list that no corrected template will ever mention.
 */
const walk = (nodes: readonly AstNode[], state: WalkState): void => {
  for (const node of nodes) {
    let descend = true;
    if (node.type === 'MustacheStatement') visitMustache(node, state);
    else if (node.type === 'BlockStatement') descend = visitBlock(node, state);
    if (!descend) continue;
    if (node.body !== undefined) walk(node.body, state);
    if (node.program !== undefined) walk(node.program.body ?? [], state);
    if (node.inverse !== undefined) walk(node.inverse.body ?? [], state);
  }
};

const emptyAnalysis = (issues: readonly TemplateIssue[]): TemplateAnalysis => ({
  variables: [],
  references: [],
  conditionals: [],
  issues,
});

/** Line Handlebars names in a parse error, or undefined when it names none. */
const parseErrorLine = (message: string): number | undefined =>
  /^Parse error on line (\d+)/u.exec(message)?.[1] === undefined
    ? undefined
    : Number.parseInt(/^Parse error on line (\d+)/u.exec(message)?.[1] ?? '', 10);

/**
 * Turn a Handlebars parse error into one readable line.
 *
 * Handlebars emits either a four-line report — a header, the source, a caret,
 * and a `Expecting …` diagnosis — or a terse `{{#each}} doesn't match {{/if}}`.
 * Its first line is always just `Parse error on line N:`, so passing the head
 * through would show the author a location and no reason. Take the last
 * non-empty line instead, and spell out the terse form.
 */
const parseErrorReason = (message: string): string => {
  const mismatch = /^(\S+) doesn't match (\S+)/u.exec(message);
  if (mismatch !== null) {
    const [, opener = '', closer = ''] = mismatch;
    return `{{#${opener}}} is closed by {{/${closer}}}`;
  }
  const lines = message.split('\n').filter((line) => line.trim() !== '');
  const last = lines[lines.length - 1] ?? 'could not be parsed';
  return last.replace(/^Expecting /u, 'expected ').replace(/, got /u, ', but found ');
};

/** First line of a thrown message — for render errors, which are already terse. */
const firstLine = (cause: unknown): string => {
  const message = cause instanceof Error ? cause.message : String(cause);
  return message.split('\n')[0] ?? 'render failed';
};

/**
 * Parse a template and report everything mechanically checkable about it:
 * syntax errors, disallowed constructs, illegal variable names, and the
 * ordered sets of names it references and guards. Never throws — a broken
 * template comes back as an `issues` entry so `verify` can list all problems
 * in one pass.
 * @param template - prompt template text
 * @returns the analysis; `issues` is empty only for a clean template
 */
export const inspect = (template: string): TemplateAnalysis => {
  const state: WalkState = { variables: [], references: [], conditionals: [], issues: [] };

  let program: AstNode;
  try {
    // SAFETY: `engine.parse` returns Handlebars' `hbs.AST.Program`, whose
    // runtime shape is exactly the `AstNode` subset declared above. It is
    // the sole producer of this value, and `walk` below reads nothing beyond
    // the fields `AstNode` declares.
    program = engine.parse(template) as AstNode;
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    const line = parseErrorLine(message);
    return emptyAnalysis([
      issue(
        'syntax',
        `Template is not valid Handlebars: ${parseErrorReason(message)}`,
        line,
        line === undefined
          ? 'Fix the Handlebars syntax — most often an {{#if}} without a matching {{/if}}.'
          : `Fix the template around line ${line} — most often close the {{#if}} with {{/if}}, or open a {{#if}} for a stray {{/if}}.`,
      ),
    ]);
  }

  walk(program.body ?? [], state);
  return {
    variables: state.variables,
    references: state.references,
    conditionals: state.conditionals,
    issues: state.issues,
  };
};

/** True when the template parses and uses only the allowed grammar. */
export const isValid = (template: string): boolean => inspect(template).issues.length === 0;

/** One line per problem, prefixed for line-oriented output. */
export const formatIssues = (issues: ReadonlyArray<TemplateIssue>): string =>
  issues
    .map((found) => {
      const where = found.line === undefined ? '' : ` (line ${found.line})`;
      return `- ${found.message}${where}\n  Fix: ${found.fix}`;
    })
    .join('\n');

/** One declared variable paired with the value it resolves to. */
export interface ResolvedVariable {
  readonly name: string;
  readonly value: string;
}

/**
 * Build the render context for a prompt. Total by construction: every
 * declared variable gets an entry, so no branch can reference a name that is
 * missing from the context and trip Handlebars' strict mode.
 * @param variables - declared variables with their resolved values
 * @returns the context object to render with
 */
export const buildContext = (variables: ReadonlyArray<ResolvedVariable>): Record<string, string> =>
  Object.fromEntries(variables.map((variable) => [variable.name, variable.value]));

/**
 * Render a template to text. `noEscape` is always on — a prompt is prose for
 * an agent, and HTML escaping would corrupt it. Throws
 * {@link TemplateRenderError} when the template does not compile.
 * @param template - prompt template text
 * @param context - variable values by name
 * @returns the rendered text
 * @throws TemplateRenderError when the template fails to compile
 */
export const render = (template: string, context: Readonly<Record<string, string>>): string => {
  try {
    return engine.compile(template, RENDER_OPTIONS)(context);
  } catch (cause) {
    throw new TemplateRenderError(`Template failed to render: ${firstLine(cause)}`, cause);
  }
};
