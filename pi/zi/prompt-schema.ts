import { Schema } from 'effect';

/**
 * Effect Schema for the JSON prompt configuration.
 *
 * Prompts ("prompt factories") persist a reusable, parameterized prompt as
 * `.agents/@montflow/prompts/<name>.json`. A prompt is a template plus a
 * list of variable placeholders: the template contains `{{variable}}`
 * tokens, and when the prompt is RUN the UI collects a value for each
 * variable, substitutes it into the template, and dispatches the fully
 * rendered text to an isolated agentic run.
 *
 * ```json
 * {
 *   "version": 1,
 *   "name": "security-audit",
 *   "description": "Audit a set of files for security issues",
 *   "template": "Audit these files for security vulnerabilities:\n{{files}}\n\nFocus on: {{focus}}",
 *   "variables": [
 *     { "name": "files", "label": "Files", "description": "Paths to audit", "required": true },
 *     { "name": "focus", "label": "Focus", "type": "textarea", "required": false, "default": "auth, session handling" }
 *   ],
 *   "skills": ["security-auditor"]
 * }
 * ```
 *
 * Variables are references — the template is just text and the schema does
 * not try to validate that every `{{token}}` has a matching variable (or
 * vice-versa); the run dialog collects what it can and leaves unmatched
 * tokens untouched.
 *
 * `skills` lists workspace skills (by SKILL.md frontmatter name) attached to
 * the prompt. When the prompt is run, those skills' instructions are loaded
 * into the agent's context alongside the rendered template.
 */

/** Input widget a variable renders as when the prompt is run (defaults to `text`). */
export const PromptVariableTypeSchema = Schema.Literals(['text', 'textarea']);

/**
 * One parameter of a prompt. `name` is the identifier used inside the
 * template as `{{name}}`. Everything else is optional presentation/default
 * metadata.
 */
export const PromptVariableSchema = Schema.Struct({
  /** Identifier matched in the template as `{{name}}`. */
  name: Schema.String,
  /** Human-readable label shown in the run dialog (defaults to the name). */
  label: Schema.optional(Schema.String),
  /** Help text under the field in the run dialog. */
  description: Schema.optional(Schema.String),
  /** `text` (single line) or `textarea` (multi-line); defaults to `text`. */
  type: Schema.optional(PromptVariableTypeSchema),
  /** True when the run dialog must collect a value before dispatching (default true). */
  required: Schema.optional(Schema.Boolean),
  /** Seed value pre-filled in the run dialog. */
  default: Schema.optional(Schema.String),
});

/**
 * A stored prompt: a versioned wrapper around a template + its variables.
 * `template` is required (it may be empty to start). `name` is the file
 * slug; the router stamps it to match the file name at write time.
 */
export const PromptSchema = Schema.Struct({
  version: Schema.Literal(1),
  name: Schema.String,
  /** Optional one-line summary shown in list/detail views. */
  description: Schema.optional(Schema.String),
  /** The prompt template with `{{variable}}` placeholders. */
  template: Schema.String,
  /** Ordered variable definitions (order controls the run dialog layout). */
  variables: Schema.optional(Schema.Array(PromptVariableSchema)),
  /** Workspace skills (by SKILL.md frontmatter name) loaded into the run's context. */
  skills: Schema.optional(Schema.Array(Schema.String)),
});

/**
 * Schema that decodes/encodes a whole prompt file to/from a JSON string.
 * Decoding validates the structure and throws `ParseError` on malformed
 * input; encoding produces the compact JSON text.
 */
export const PromptFromJson = Schema.fromJsonString(PromptSchema);

/** Decoded (validated) shape of a prompt file. */
export type PromptDecoded = Schema.Schema.Type<typeof PromptSchema>;

/** Decoded (validated) shape of a single prompt variable. */
export type PromptVariableDecoded = Schema.Schema.Type<typeof PromptVariableSchema>;

/**
 * True when a template references the given variable name as `{{name}}`
 * somewhere in its text. Used to flag orphan variables in the editor.
 */
export const templateUsesVariable = (template: string, name: string): boolean =>
  new RegExp(`\\{\\{\\s*${escapeRegExp(name)}\\s*\\}\\}`).test(template);

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
