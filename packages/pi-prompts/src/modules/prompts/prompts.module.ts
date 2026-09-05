import { Effect, Schema } from 'effect';

/**
 * A stored prompt template: a versioned, parameterized prompt plus the
 * metadata a run dialog needs. The class is the schema and the type in one:
 * `Prompt` decodes/encodes/makes, `Prompt` annotates values.
 *
 * Persisted by the consuming extension (e.g. `.agents/@montflow/prompts/`);
 * this package holds no filesystem code.
 */
export class Prompt extends Schema.Class<Prompt>('Prompt')({
  /** File slug — matches the prompt file name. */
  name: Schema.NonEmptyString,
  /** One-line summary shown in list views. */
  description: Schema.String,
  /** Template text with `{{variable}}` placeholders (may start empty). */
  template: Schema.String,
  /** Ordered variable names — order controls the run dialog layout. */
  variables: Schema.Array(Schema.NonEmptyString),
  /** Skill names (SKILL.md frontmatter `name:`) loaded into the run's context. */
  skills: Schema.Array(Schema.NonEmptyString),
  /** Preferred model as `provider/model-id`, or '' when unset. */
  model: Schema.String,
}) {}

/**
 * Create a prompt with defaults for everything but name and template.
 * @param name - file slug for the prompt
 * @param template - prompt template with `{{variable}}` placeholders
 * @param description - one-line summary shown in list views
 * @param model - preferred model as `provider/model-id`, or '' when unset
 * @param variables - ordered variable names for the run dialog
 * @param skills - skill names loaded into the run's context
 * @returns the new prompt
 */
export const make = (
  name: string,
  template: string,
  description = '',
  model = '',
  variables: readonly string[] = [],
  skills: readonly string[] = [],
): Prompt =>
  Prompt.make({
    name,
    description,
    template,
    variables: [...variables],
    skills: [...skills],
    model,
  });

/**
 * Decode untrusted input (JSON files, RPC payloads) into a `Prompt`.
 */
export const decodeUnknown = Schema.decodeUnknownEffect(Prompt);

/**
 * Encode a `Prompt` for persistence (JSON files, RPC payloads).
 */
export const encode = Schema.encodeSync(Prompt);

/**
 * Schema that decodes/encodes a whole prompt file to/from a JSON string.
 */
export const FromJson = Schema.fromJsonString(Prompt);

/**
 * Render a template to a string with collected variable values. Every
 * `{{name}}` token is replaced with `values[name]`; tokens with no (or
 * empty) value are left verbatim so the caller can see what is still
 * unfilled. String is the default target — future targets get their own
 * function (`renderToMarkdown`, …).
 * @param template - prompt template with `{{variable}}` placeholders
 * @param values - collected variable values by name
 * @returns the rendered template
 */
export const renderToString = (
  template: string,
  values: Readonly<Record<string, string>>,
): string =>
  template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (token, rawName: string) => {
    const name = rawName.trim();
    const value = values[name];
    return value !== undefined && value !== '' ? value : token;
  });

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * True when a template references the given variable name as `{{name}}`.
 * @param template - prompt template with `{{variable}}` placeholders
 * @param name - variable name to look for
 * @returns true when the template uses the variable
 */
export const usesVariable = (template: string, name: string): boolean =>
  new RegExp(`\\{\\{\\s*${escapeRegExp(name)}\\s*\\}\\}`).test(template);

/**
 * Render a prompt's template, failing when the template is empty.
 * @param prompt - prompt descriptor
 * @param values - collected variable values by name
 * @returns Effect resolving to the rendered template, failing on empty templates
 */
export const renderPrompt = (
  prompt: Prompt,
  values: Readonly<Record<string, string>>,
): Effect.Effect<string, string> => {
  if (prompt.template === '') {
    return Effect.fail(`prompt '${prompt.name}' has an empty template`);
  }
  return Effect.succeed(renderToString(prompt.template, values));
};
