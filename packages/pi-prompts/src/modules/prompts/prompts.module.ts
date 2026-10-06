import { Effect, Schema, SchemaGetter } from 'effect';
import * as TemplateEngine from '../template-engine/index.js';

/**
 * One template variable, in its *resolved* form: every field has a value, so
 * callers never write `?? true` or `?? ''`. On disk the fields below
 * `name` are optional and omitted when they hold their default — see
 * {@link VariableEntry}, which also still accepts the bare-string form
 * (`"files"`) that pre-schema prompt files used.
 */
export class Variable extends Schema.Class<Variable>('PromptVariable')({
  /** Identifier used in the template as `{{name}}` and in the run dialog. */
  name: Schema.NonEmptyString,
  /** Human-readable label for the run dialog. Defaults to `name`. */
  label: Schema.String,
  /** Help text under the field in the run dialog. Empty when unstated. */
  description: Schema.String,
  /** `text` (single line) or `textarea` (multi-line). Defaults to `text`. */
  type: Schema.Literals(['text', 'textarea']),
  /**
   * True when the run dialog must collect a value before the prompt can
   * dispatch. Defaults to true, which preserves the pre-schema behaviour
   * where every `{{name}}` had to be filled in.
   */
  required: Schema.Boolean,
  /**
   * Value used when the user leaves the field blank, and the value an
   * `{{#if name}}` guard tests. Empty means "no fallback", so the guard is
   * false unless the user actually supplied something. See `GRAMMAR`.
   */
  default: Schema.String,
}) {}

/** The on-disk shape of a variable: only `name` is required. */
const VariableFile = Schema.Struct({
  name: Schema.NonEmptyString,
  label: Schema.optionalKey(Schema.String),
  description: Schema.optionalKey(Schema.String),
  type: Schema.optionalKey(Schema.Literals(['text', 'textarea'])),
  required: Schema.optionalKey(Schema.Boolean),
  default: Schema.optionalKey(Schema.String),
});

/** The optional-field JSON shape `encode` writes, with defaults left out. */
interface VariableFileValue {
  readonly name: string;
  readonly label?: string;
  readonly description?: string;
  readonly type?: 'text' | 'textarea';
  readonly required?: boolean;
  readonly default?: string;
}

/** A `variables` entry in either accepted on-disk form. */
const VariableSource = Schema.Union([Schema.String, VariableFile]);

/** A variable file being filled in, so fields left at their default can be omitted. */
interface MutableVariableFile {
  name: string;
  label?: string;
  description?: string;
  type?: 'text' | 'textarea';
  required?: boolean;
  default?: string;
}

/**
 * Narrow a union member to the legacy bare-name form. Written as its own
 * function so the discriminator is stated once, with its contract.
 */
const isBareName = (entry: string | VariableFileValue): entry is string =>
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- `entry` is the declared union `string | VariableFileValue` produced by `VariableSource`; `typeof` picks which arm of that contract to fill in, not an unparsed value.
  typeof entry === 'string';

/** Fully-defaulted JSON for a variable, as `encode` writes it. */
const toFile = (variable: Variable): VariableFileValue => {
  const file: MutableVariableFile = { name: variable.name };
  if (variable.label !== variable.name) file.label = variable.label;
  if (variable.description !== '') file.description = variable.description;
  if (variable.type !== 'text') file.type = variable.type;
  if (!variable.required) file.required = false;
  if (variable.default !== '') file.default = variable.default;
  return file;
};

/** Every field of a variable, resolved — the shape `decode` fills in. */
interface ResolvedVariableFile {
  readonly name: string;
  readonly label: string;
  readonly description: string;
  readonly type: 'text' | 'textarea';
  readonly required: boolean;
  readonly default: string;
}

/** Fill in every default a `variables` entry left out. */
const resolveFile = (entry: string | VariableFileValue): ResolvedVariableFile =>
  isBareName(entry)
    ? { name: entry, label: entry, description: '', type: 'text', required: true, default: '' }
    : {
        name: entry.name,
        label: entry.label ?? entry.name,
        description: entry.description ?? '',
        type: entry.type ?? 'text',
        required: entry.required ?? true,
        default: entry.default ?? '',
      };

/**
 * One `variables` entry as it may appear in a prompt file: a bare name
 * (the legacy form, meaning "required, no default") or an object.
 * `VariableEntry` normalizes either into a resolved {@link Variable} and
 * encodes back to the minimal object form, so a legacy `"files"` entry
 * round-trips to `{"name": "files"}` and never grows default noise.
 */
export const VariableEntry = Schema.decodeTo<typeof Variable, typeof VariableSource>(Variable, {
  decode: SchemaGetter.transform(resolveFile),
  encode: SchemaGetter.transform(toFile),
})(VariableSource);

/**
 * A stored prompt template: a versioned, parameterized prompt plus the
 * metadata a run dialog needs. The class is the schema and the type in one:
 * `Prompt` decodes/encodes/makes, `Prompt` annotates values.
 *
 * The template is Handlebars restricted to a closed grammar — see
 * `TemplateEngine.GRAMMAR` for the full list and `authoringRules` for the
 * rules as an agent needs them. In short: `{{name}}` substitutes,
 * `{{#if name}}` / `{{#unless name}}` branch on whether the variable has a
 * value, and nothing else is allowed.
 *
 * Persisted by the consuming extension (e.g. `.agents/@montflow/pi-prompts/`);
 * this package holds no filesystem code.
 */
export class Prompt extends Schema.Class<Prompt>('Prompt')({
  /** File slug — matches the prompt file name. */
  name: Schema.NonEmptyString,
  /** One-line summary shown in list views. */
  description: Schema.String,
  /** Prompt text in the restricted Handlebars grammar (may start empty). */
  template: Schema.String,
  /** Declared variables, in first-appearance order — the run dialog layout. */
  variables: Schema.Array(VariableEntry),
  /** Skill names (SKILL.md frontmatter `name:`) loaded into the run's context. */
  skills: Schema.Array(Schema.NonEmptyString),
  /** Preferred model as `provider/model-id`, or '' when unset. */
  model: Schema.String,
}) {}

/** Every template variable, required, with no default. */
export const requiredVariable = (name: string): Variable =>
  new Variable({
    name,
    label: name,
    description: '',
    type: 'text',
    required: true,
    default: '',
  });

/**
 * Create a prompt, deriving `variables` from the template when not given.
 * @param name - file slug for the prompt
 * @param template - prompt template
 * @param description - one-line summary shown in list views
 * @param model - preferred model as `provider/model-id`, or '' when unset
 * @param variables - declared variables for the run dialog
 * @param skills - skill names loaded into the run's context
 * @returns the new prompt
 */
export const make = (
  name: string,
  template: string,
  description = '',
  model = '',
  variables?: readonly Variable[],
  skills: readonly string[] = [],
): Prompt =>
  new Prompt({
    name,
    description,
    template,
    variables: variables ?? templateVariables(template).map(requiredVariable),
    skills: [...skills],
    model,
  });

/** Slug pattern: lowercase alphanumeric groups joined by single hyphens. */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * True when `name` is a valid prompt slug (lowercase, hyphen-separated).
 * @param name - candidate slug
 * @returns true for valid slugs
 */
export const isValidName = (name: string): boolean => SLUG_PATTERN.test(name);

/**
 * Lowercases and converts any run of non-alphanumeric characters into a
 * single hyphen, trimming leading/trailing hyphens.
 * @param name - raw display name
 * @returns slugified name
 */
export const slugify = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Decode untrusted input (JSON files, RPC payloads) into a `Prompt`. */
export const decodeUnknown = Schema.decodeUnknownEffect(Prompt);

/** Encode a `Prompt` for persistence (JSON files, RPC payloads). */
export const encode = Schema.encodeSync(Prompt);

/** Schema that decodes/encodes a whole prompt file to/from a JSON string. */
export const FromJson = Schema.fromJsonString(Prompt);

/**
 * Every variable name the template mentions, in first-appearance order, whether
 * it is substituted (`{{name}}`) or guards a branch (`{{#if name}}`). The
 * template is the source of truth for the run dialog layout; `variables` must
 * mirror this list exactly.
 *
 * Falls back to an empty list when the template does not parse — `verify` is
 * what reports the syntax error, and a UI that lists nothing is better than
 * one that throws.
 * @param template - prompt template
 * @returns variable names in first-appearance order
 */
export const templateVariables = (template: string): readonly string[] =>
  TemplateEngine.inspect(template).variables;

/** A template's analysis: referenced names, guarded names, and template issues. */
export const analyze = (template: string): TemplateEngine.TemplateAnalysis =>
  TemplateEngine.inspect(template);

/** True when the template parses and stays inside the allowed grammar. */
export const isValidTemplate = (template: string): boolean => TemplateEngine.isValid(template);

/**
 * Effective value of each declared variable for a set of collected answers:
 * the user's value when non-empty, otherwise the variable's `default`. A
 * variable with neither is `''`, which is false — so `{{#if name}}` takes
 * the `{{else}}` branch exactly when the user supplied nothing.
 * @param variables - declared variables
 * @param values - collected user values by name
 * @returns one resolved value per declared variable, in declared order
 */
export const resolveValues = (
  variables: ReadonlyArray<Variable>,
  values: Readonly<Record<string, string>>,
): ReadonlyArray<{ readonly name: string; readonly value: string }> =>
  variables.map((variable) => {
    const supplied = values[variable.name];
    const value = supplied !== undefined && supplied !== '' ? supplied : variable.default;
    return { name: variable.name, value };
  });

/**
 * Names the user still has to answer before the prompt can dispatch: those
 * declared `required` with no `default`, and not already answered.
 * @param variables - declared variables
 * @param values - collected user values by name
 * @returns the outstanding names, in declared order
 */
export const missingRequired = (
  variables: ReadonlyArray<Variable>,
  values: Readonly<Record<string, string>>,
): readonly string[] =>
  resolveValues(variables, values)
    .filter((entry) => {
      const variable = variables.find((candidate) => candidate.name === entry.name);
      return variable?.required === true && entry.value === '';
    })
    .map((entry) => entry.name);

/**
 * Render a template to text with collected values. Declared variables are
 * resolved (see {@link resolveValues}) and every one is passed to the
 * template, so an untaken branch can never reference a missing name.
 * @param template - prompt template
 * @param variables - declared variables
 * @param values - collected user values by name
 * @returns the rendered text
 */
export const renderToString = (
  template: string,
  variables: ReadonlyArray<Variable>,
  values: Readonly<Record<string, string>>,
): string =>
  TemplateEngine.render(template, TemplateEngine.buildContext(resolveValues(variables, values)));

/**
 * True when a template references the given name, either to substitute it or
 * to guard a branch on it.
 * @param template - prompt template
 * @param name - variable name to look for
 * @returns true when the template uses the variable
 */
export const usesVariable = (template: string, name: string): boolean =>
  templateVariables(template).includes(name);

/**
 * Render a prompt's template, failing on an empty template or a template that
 * does not compile.
 * @param prompt - prompt descriptor
 * @param values - collected variable values by name
 * @returns Effect resolving to the rendered template
 */
export const renderPrompt = (
  prompt: Prompt,
  values: Readonly<Record<string, string>>,
): Effect.Effect<string, string> => {
  if (prompt.template === '') {
    return Effect.fail(`prompt '${prompt.name}' has an empty template`);
  }
  return Effect.try(() => renderToString(prompt.template, prompt.variables, values)).pipe(
    Effect.mapError((cause) =>
      cause instanceof Error ? cause.message : `prompt '${prompt.name}' failed to render`,
    ),
  );
};

/** One mechanical check failure: which field broke, why, and how to fix it. */
export interface VerifyIssue {
  readonly field: string;
  readonly message: string;
  /** Concrete instruction for whoever authored the file. Omitted when none applies. */
  readonly fix?: string;
  /** 1-based template line, for issues located in the template. */
  readonly line?: number;
}

/** Mechanical verification outcome for one prompt file. */
export interface VerifyResult {
  readonly valid: boolean;
  readonly issues: ReadonlyArray<VerifyIssue>;
  /**
   * The `variables` list the template implies, as ready-to-paste JSON. Set
   * whenever coverage or ordering is wrong, so an author can replace the
   * field wholesale instead of guessing.
   */
  readonly expectedVariables?: string;
}

/** A `VerifyResult` being filled in, so `expectedVariables` can stay absent. */
interface MutableVerifyResult {
  valid: boolean;
  issues: ReadonlyArray<VerifyIssue>;
  expectedVariables?: string;
}

/** A `VerifyIssue` being filled in, so `fix` and `line` can stay absent. */
interface MutableVerifyIssue {
  field: string;
  message: string;
  fix?: string;
  line?: number;
}

const verifyIssue = (field: string, message: string, fix?: string, line?: number): VerifyIssue => {
  const issue: MutableVerifyIssue = { field, message };
  if (fix !== undefined) issue.fix = fix;
  if (line !== undefined) issue.line = line;
  return issue;
};

/**
 * The `variables` list the template implies, as pretty JSON. Unindented —
 * {@link verifyReport} and the `fix` text apply whatever hanging indent their
 * output needs.
 */
const expectedJson = (names: readonly string[]): string =>
  JSON.stringify(
    names.map((name) => ({ name, required: true })),
    null,
    2,
  );

/** Indent every line of a block by `pad` spaces, so a nested block lines up. */
const indentBlock = (block: string, pad: number): string => {
  const margin = ' '.repeat(pad);
  return block
    .split('\n')
    .map((line) => margin + line)
    .join('\n');
};

/**
 * Mechanically verify a prompt file against the prompt standard. Pure — no IO;
 * the caller supplies the raw file contents. Checks, in order:
 *
 * 1. valid JSON decoding to a `Prompt`
 * 2. a slug `name` matching the file name
 * 3. non-empty `description` and `template`
 * 4. the template parses and stays inside the allowed grammar
 * 5. every template variable is declared, in first-appearance order, once
 * 6. every declared variable is a legal flat name, and is actually used
 * 7. a variable is not both `required` and given a `default`
 *
 * @param name - prompt file name slug (without `.json`)
 * @param raw - raw prompt file contents
 * @returns the result; `valid` is true only with zero issues
 */
export const verifyPromptFile = (name: string, raw: string): VerifyResult => {
  let prompt: Prompt;
  try {
    prompt = Schema.decodeUnknownSync(FromJson)(raw);
  } catch {
    return {
      valid: false,
      issues: [
        verifyIssue(
          'json',
          'Not a valid prompt file.',
          'Write valid JSON with exactly the fields: name, description, template, variables, skills, model.',
        ),
      ],
    };
  }
  // The file name is a property of the *file*, not of the decoded prompt, so
  // it is checked here and appended rather than duplicated in `verifyPrompt`.
  // Note the order: the names-match test comes first, so a mismatch is
  // appended even when everything else passed — which is the only case where
  // `result.valid` is still true here.
  const result = verifyPrompt(prompt);
  if (prompt.name === name) return result;
  const outcome: MutableVerifyResult = {
    // Recomputed, not spread: a mismatch is always a failure, so carrying
    // `result.valid` through would report `valid: true` alongside an issue.
    valid: false,
    issues: [
      ...result.issues,
      verifyIssue('name', `Must match the file name '${name}'.`, `Set "name" to "${name}".`),
    ],
  };
  if (result.expectedVariables !== undefined) {
    outcome.expectedVariables = result.expectedVariables;
  }
  return outcome;
};

/**
 * Every mechanical check on a decoded prompt, minus the file-name match.
 *
 * Split out from {@link verifyPromptFile} so `PromptExecute.execute` can apply
 * exactly the same rules to a prompt it already holds, with no file read. That
 * matters: `execute` used to check only the *template grammar*, so a template
 * referencing an undeclared variable — which the file verifier rejects — would
 * still render, substituting nothing, and the agent would dispatch a prompt
 * silently missing a value.
 * @param prompt - a decoded prompt
 * @returns the verification result
 */
export const verifyPrompt = (prompt: Prompt): VerifyResult => {
  // `name` is unused: the slug check reads `prompt.name` directly, and the
  // file-name match belongs to `verifyPromptFile`.
  const issues: Array<VerifyIssue> = [];
  if (!isValidName(prompt.name))
    issues.push(
      verifyIssue(
        'name',
        'Must be lowercase alphanumeric groups joined by single hyphens.',
        `Rename to a kebab-case slug, e.g. '${slugify(prompt.name) || 'my-prompt'}'.`,
      ),
    );
  if (prompt.description.trim() === '')
    issues.push(
      verifyIssue(
        'description',
        'Required field is missing or empty.',
        'Write one line saying what the prompt does.',
      ),
    );
  if (prompt.template.trim() === '')
    issues.push(
      verifyIssue('template', 'Required field is missing or empty.', 'Write the prompt text.'),
    );

  // Template grammar. A syntax error makes the reference set unknowable, so
  // the coverage checks below are skipped and only the parse issue is reported.
  const analysis = TemplateEngine.inspect(prompt.template);
  for (const found of analysis.issues) {
    issues.push(verifyIssue('template', found.message, found.fix, found.line));
  }
  if (analysis.issues.some((found) => found.kind === 'syntax')) {
    return { valid: false, issues };
  }

  const implied = analysis.variables;
  const declared = prompt.variables;
  const seen = new Set<string>();
  /**
   * Whether the declared list still agrees with the template's implied list
   * (order aside). Set false by anything that makes the list itself wrong,
   * which is also the condition for offering the expected list back.
   */
  let listAgrees = true;

  for (const variable of declared) {
    if (seen.has(variable.name)) {
      issues.push(
        verifyIssue(
          'variables',
          `'${variable.name}' is listed more than once.`,
          'Keep exactly one entry per variable.',
        ),
      );
      listAgrees = false;
    }
    seen.add(variable.name);
    if (!TemplateEngine.isValidVariableName(variable.name)) {
      issues.push(
        verifyIssue(
          'variables',
          `'${variable.name}' is not a usable variable name.`,
          `Names must match [a-zA-Z_][a-zA-Z0-9_]*; use '${variable.name.replace(/[^a-zA-Z0-9_]/g, '_')}' and update the template to match.`,
        ),
      );
    }
    if (variable.required && variable.default !== '') {
      issues.push(
        verifyIssue(
          'variables',
          `'${variable.name}' is required but also has a default, so it can never be blank.`,
          `Either drop "default" (the user must supply it) or set "required": false.`,
        ),
      );
    }
  }

  for (const referenced of implied) {
    if (!seen.has(referenced)) {
      issues.push(
        verifyIssue(
          'variables',
          `Template uses '${referenced}' but it is not listed in 'variables'.`,
          `Add it, or remove the reference from the template.`,
        ),
      );
      listAgrees = false;
    }
  }
  for (const variable of declared) {
    if (!implied.includes(variable.name)) {
      issues.push(
        verifyIssue(
          'variables',
          `'${variable.name}' is listed in 'variables' but not used in the template.`,
          `Use it in the template, or remove it from 'variables'.`,
        ),
      );
      listAgrees = false;
    }
  }
  if (listAgrees && declared.some((variable, index) => variable.name !== implied[index])) {
    issues.push(
      verifyIssue(
        'variables',
        `'variables' must be in first-appearance order.`,
        'Reorder it to match the template — the exact list is at the end of this report.',
      ),
    );
    listAgrees = false;
  }

  // `expectedVariables` is only useful when the template's implied list is
  // what the author should adopt, so it rides on the same flag as the
  // coverage checks.
  const outcome: MutableVerifyResult = { valid: issues.length === 0, issues };
  if (!listAgrees) outcome.expectedVariables = expectedJson(implied);
  return outcome;
};

/**
 * One generic verify status line for the detail-menu info panel.
 * @param result - result from {@link verifyPromptFile}
 * @returns one status line for the panel
 */
export const verifyInfoLine = (result: VerifyResult): string => {
  if (result.valid) return '✓ verified';
  const count = result.issues.length;
  return `✗ not verified — ${count} issue${count === 1 ? '' : 's'}`;
};

/**
 * The full verification report, written for an agent to act on: the status,
 * every issue with its `Fix:` line, and — when the variable list is wrong —
 * the exact JSON to paste, once, in a trailing block. `/mf-prompts verify`
 * returns this on failure.
 * @param name - prompt name under verification
 * @param result - result from {@link verifyPromptFile}
 * @returns a multi-line report
 */
export const verifyReport = (name: string, result: VerifyResult): string => {
  if (result.valid) return `✓ '${name}' matches the standard format.`;
  const count = result.issues.length;
  const lines = [
    `✗ '${name}' has ${count} issue${count === 1 ? '' : 's'}. Fix each one and run verify again.`,
    '',
  ];
  result.issues.forEach((found, index) => {
    const where = found.line === undefined ? '' : ` (line ${found.line})`;
    lines.push(`${index + 1}. [${found.field}] ${found.message}${where}`);
    if (found.fix !== undefined) lines.push(`   Fix: ${found.fix}`);
  });
  if (result.expectedVariables !== undefined) {
    lines.push(
      '',
      'The template references these variables, in this order:',
      indentBlock(result.expectedVariables, 2),
    );
  }
  return lines.join('\n');
};

/**
 * The rules a prompt author must follow, as one string. Single source of truth
 * for the create/modify agent pre-prompts; the skills restate it in prose.
 * @returns the authoring rules
 */
export const authoringRules = (): string => `The file is valid JSON (double quotes, no comments, no
trailing commas) with exactly these fields:

- name: kebab-case file slug, equal to the file name
- description: one non-empty line saying what the prompt does
- template: the prompt text
- variables: the template's variables, in first-appearance order
- skills: skill names the run loads (empty when none)
- model: preferred model as provider/model-id, or "" when unset

Template syntax — Handlebars, restricted to these constructs only:

  {{name}}                substitute the variable's value
  {{! note }}             comment, not rendered
  {{#if name}}…{{/if}}    include the block when the value is non-empty
  {{#unless name}}…{{/unless}}
  {{else}}                alternative branch of the enclosing if/unless
  {{else if name}}        chained branch
  {{~ … ~}}               strip surrounding whitespace and newlines

Nothing else is accepted. No {{#each}}, no {{#with}}, no helper calls, no
subexpressions like {{#if (eq a b)}}, no dotted paths like {{user.name}}, no
data variables like {{@index}}, no partials. A prompt variable is a single
flat string, so a nested or list-shaped construct has no value to receive.

Each entry in 'variables' is either a bare name (meaning: required, no
default) or an object:

  { "name": "scope", "label": "Scope", "description": "What to limit to",
    "type": "text" | "textarea", "required": true | false, "default": "…" }

Omit any field to take its default: label = name, description = "", type =
"text", required = true, default = "". Omit fields that hold their default —
an entry that is only required and unlabelled should be just { "name": "…" }.

How 'required', 'default', and {{#if}} interact — the one rule that matters:

  A conditional tests the variable's effective value: what the user supplied,
  or the variable's "default" when the user left the field blank, or empty
  when there is neither.

So for "if the user gave me a scope, use it, otherwise do the default thing",
declare the variable as { "name": "scope", "required": false } with no
"default" and write the fallback in {{else}}:

  {{#if scope}}Some text this is the scope: {{scope}}
  {{else}}Use the git to determine the unstaged changes to include.{{/if}}

Leaving "scope" blank is what makes the {{else}} branch run. Conversely, a
variable WITH a non-empty "default" is truthy by default, so only guard it
with {{#if}} if you want that default suppressed when the field is left
blank. Never mark a variable "required": true and give it a "default" — a
required variable with a default can never be blank, and the verifier rejects
it.`;
