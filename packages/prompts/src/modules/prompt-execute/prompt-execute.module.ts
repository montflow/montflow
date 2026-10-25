import { Effect } from 'effect';
import * as Prompts from '../prompts/index.js';

/**
 * The two halves of *using* a stored prompt: look at it (`inspect`), then
 * run it (`execute`). `../prompts/` owns the file shape and knows how to
 * render a template; this module knows what a caller must supply, and what to
 * tell them when they have not.
 *
 * Both entry points are pure. `execute` resolves a plan rather than
 * dispatching a run, so the validation an agent has to satisfy is testable
 * without a model, and so the same plan can drive the CLI, the TUI, and a Pi
 * tool. Dispatching it is the caller's job, through {@link PromptExecutor}.
 */

/** One variable, flattened for display: what it is and what it currently holds. */
export interface VariableSummary {
  /** Identifier used in the template as `{{name}}`. */
  readonly name: string;
  /** Label shown in the run dialog; equals `name` when unset. */
  readonly label: string;
  /** `text` or `textarea`. */
  readonly type: 'text' | 'textarea';
  /** True when the run cannot dispatch without a value. */
  readonly required: boolean;
  /** Value used when the user leaves the field blank. Empty when none. */
  readonly default: string;
  /** True when the template only tests this name (`{{#if name}}`), never substitutes it. */
  readonly conditional: boolean;
  /** Effective value right now: supplied, else `default`, else empty. */
  readonly value: string;
  /** True when nothing supplied it and there is no default. */
  readonly unanswered: boolean;
}

/** A whole prompt, flattened for display. */
export interface PromptSummary {
  readonly name: string;
  readonly description: string;
  /** `provider/model-id`, or empty when the prompt pins none. */
  readonly model: string;
  readonly skills: ReadonlyArray<string>;
  readonly template: string;
  readonly variables: ReadonlyArray<VariableSummary>;
  /** Required variables with no value and no default, in declared order. */
  readonly missing: ReadonlyArray<string>;
}

/** What to describe: a prompt, plus any values already collected. */
export interface InspectRequest {
  readonly prompt: Prompts.Prompt;
  /** Collected values by name. Empty means "nothing supplied yet". */
  readonly values?: Readonly<Record<string, string>> | undefined;
}

/** Resolved values paired with the summaries that describe them. */
const summarize = (
  prompt: Prompts.Prompt,
  values: Readonly<Record<string, string>>,
): ReadonlyArray<VariableSummary> => {
  const analysis = Prompts.analyze(prompt.template);
  const substituted = new Set(analysis.references);
  return prompt.variables.map((variable) => {
    const supplied = values[variable.name];
    const value = supplied !== undefined && supplied !== '' ? supplied : variable.default;
    return {
      name: variable.name,
      label: variable.label,
      type: variable.type,
      required: variable.required,
      default: variable.default,
      conditional: !substituted.has(variable.name) && analysis.conditionals.includes(variable.name),
      value,
      unanswered: value === '',
    };
  });
};

/**
 * Describe a prompt: its metadata, every variable with its effective value,
 * and which required values are still missing. Read-only — it never renders
 * the template, so a template with a syntax error still inspects cleanly.
 * @param request - the prompt and any collected values
 * @returns a display-ready summary
 */
export const inspect = (request: InspectRequest): PromptSummary => {
  const values = request.values ?? {};
  const variables = summarize(request.prompt, values);
  return {
    name: request.prompt.name,
    description: request.prompt.description,
    model: request.prompt.model,
    skills: [...request.prompt.skills],
    template: request.prompt.template,
    variables,
    missing: variables
      .filter((variable) => variable.required && variable.unanswered)
      .map((variable) => variable.name),
  };
};

/** One `label  value` metadata line, with a placeholder when empty. */
const metaLine = (label: string, value: string): string =>
  `  ${label.padEnd(10)}${value === '' ? '(none)' : value}`;

/** Render a row of cells padded to the shared column widths. */
const row = (cells: ReadonlyArray<string>, widths: ReadonlyArray<number>): string =>
  `  ${cells
    .map((cell, index) => cell.padEnd(widths[index] ?? 0))
    .join('  ')
    .trimEnd()}`;

/** Em dash stands in for an empty cell, so a blank column is not a layout bug. */
const cell = (value: string): string => (value === '' ? '—' : value);

/**
 * Render a summary as plain text for `ui.notify` and for agent tool output.
 *
 * Plain text on purpose: this output is read by agents as well as humans, and
 * ANSI escapes would be noise in a tool result. Columns are padded to the
 * widest cell, so the table lines up whatever the variable names are.
 * @param summary - result of {@link inspect}
 * @returns a multi-line report
 */
export const table = (summary: PromptSummary): string => {
  const requiredCount = summary.variables.filter((variable) => variable.required).length;
  const lines: Array<string> = [
    `${summary.name}${summary.description === '' ? '' : ` — ${summary.description}`}`,
    metaLine('model', summary.model),
    metaLine('skills', summary.skills.join(', ')),
    metaLine(
      'variables',
      `${summary.variables.length} (${requiredCount} required, ${summary.variables.length - requiredCount} optional)`,
    ),
  ];

  if (summary.variables.length > 0) {
    const headers = ['NAME', 'TYPE', 'REQUIRED', 'DEFAULT', 'VALUE'];
    const body = summary.variables.map((variable) => [
      variable.label === variable.name ? variable.name : `${variable.name} (${variable.label})`,
      variable.type,
      variable.required ? 'yes' : 'no',
      cell(variable.default),
      variable.unanswered ? cell('') : variable.value,
    ]);
    const widths = headers.map((header, column) =>
      Math.max(header.length, ...body.map((cells) => (cells[column] ?? '').length)),
    );
    lines.push(
      '',
      row(headers, widths),
      row(
        widths.map((width) => '─'.repeat(width)),
        widths,
      ),
    );
    for (const cells of body) lines.push(row(cells, widths));
  }

  if (summary.missing.length > 0) {
    lines.push(
      '',
      `Missing required values: ${summary.missing.join(', ')}`,
      '  Supply them as key=value pairs, or set "required": false in the prompt file.',
    );
  }
  return lines.join('\n');
};

/** Why a prompt cannot run yet. */
export type ExecuteProblem =
  | 'empty-template'
  | 'invalid-template'
  | 'invalid-prompt'
  | 'missing-model'
  | 'missing-variables';

/** A prompt that is ready to run. */
export interface ExecuteReady {
  readonly ok: true;
  readonly prompt: string;
  /** `provider/model-id` the run must use. */
  readonly model: string;
  /** Skill names to load alongside the run. */
  readonly skills: ReadonlyArray<string>;
  /** Per-variable breakdown, so a caller can show what it is about to send. */
  readonly variables: ReadonlyArray<VariableSummary>;
  /** The rendered text that will be sent to the agent. */
  readonly text: string;
}

/** A prompt that cannot run, with a message written for whoever asked. */
export interface ExecuteBlocked {
  readonly ok: false;
  readonly problem: ExecuteProblem;
  /** Self-contained explanation: what is wrong, and the exact command to fix it. */
  readonly message: string;
  /** Required variables with no value; empty for every problem but `missing-variables`. */
  readonly missing: ReadonlyArray<string>;
}

/** Either a runnable prompt or the reason it is not runnable. */
export type ExecutePlan = ExecuteReady | ExecuteBlocked;

/** What to execute: a prompt, a model, and any values already collected. */
export interface ExecuteRequest extends InspectRequest {
  /**
   * `provider/model-id`. Falls back to the prompt's own `model` when omitted
   * or blank — a prompt may pin its model, and a caller that passes nothing
   * should not fail for that.
   */
  readonly model?: string | undefined;
  /** Skill names to load. Defaults to the prompt's own skills. */
  readonly skills?: ReadonlyArray<string> | undefined;
  /**
   * How *this* caller invokes `execute`, used verbatim in the fix-it advice of
   * every refusal — e.g. `mf-prompts execute` for the binary, or
   * `/mf-prompts execute` for the Pi slash command. Passed in rather than
   * hardcoded because the two front ends spell the same action differently, and
   * advice naming a form the reader cannot type is worse than no advice.
   */
  readonly invocation?: string | undefined;
}

/** The invocation string used when a caller does not supply one. */
export const DEFAULT_INVOCATION = 'mf-prompts execute';

/** Quote a name for use in a shell-ish `key=value` example. */
const example = (name: string): string =>
  /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `'${name}'`;

/** `missing-model` message: name the field, the flag, and the file to edit. */
const missingModel = (summary: PromptSummary, invocation: string): ExecuteBlocked => ({
  ok: false,
  problem: 'missing-model',
  message: [
    `Prompt '${summary.name}' has no model, so there is nothing to run it on.`,
    'Do one of these:',
    `  1. pass one: ${invocation} '${summary.name}' --model provider/model-id`,
    `  2. pin one in the prompt file: set "model" in .agents/@montflow/pi-prompts/${summary.name}.json`,
  ].join('\n'),
  missing: [],
});

/** `missing-variables` message: name each gap and give a runnable command. */
const missingVariables = (summary: PromptSummary, invocation: string): ExecuteBlocked => {
  const gaps = summary.variables.filter((variable) => variable.required && variable.unanswered);
  const pairs = gaps.map((variable) => `  ${variable.name.padEnd(12)}no value and no default`);
  return {
    ok: false,
    problem: 'missing-variables',
    message: [
      `Prompt '${summary.name}' needs ${gaps.length} required value${gaps.length === 1 ? '' : 's'}.`,
      ...pairs,
      'Do one of these:',
      `  1. supply them: ${invocation} '${summary.name}' --model provider/model-id ${gaps
        .map((variable) => `${example(variable.name)}=<value>`)
        .join(' ')}`,
      `  2. make them optional: set "required": false in .agents/@montflow/pi-prompts/${summary.name}.json, and give a "default" or a {{#if}} branch if the text depends on them`,
    ].join('\n'),
    missing: gaps.map((variable) => variable.name),
  };
};

/**
 * Resolve everything an execution needs, or explain what is still missing.
 *
 * Checks run cheapest-and-most-decisive first so the message names one real
 * problem rather than a pile: the template must be present and parse, a model
 * must resolve, and every required variable must have a value. Only then is
 * the template rendered.
 *
 * Pure: no IO, no model, no agent. Dispatching the returned plan is the
 * caller's job, through {@link PromptExecutor}.
 * @param request - the prompt, the model, and any collected values
 * @returns a ready plan, or a blocked plan carrying an agent-readable message
 */
export const execute = (request: ExecuteRequest): ExecutePlan => {
  const { prompt } = request;
  const values = request.values ?? {};
  const invocation = request.invocation ?? DEFAULT_INVOCATION;
  const summary = inspect({ prompt, values });

  if (prompt.template.trim() === '') {
    return {
      ok: false,
      problem: 'empty-template',
      message: `Prompt '${prompt.name}' has an empty template, so there is nothing to run. Set "template" in .agents/@montflow/pi-prompts/${prompt.name}.json.`,
      missing: [],
    };
  }

  const templateIssues = Prompts.analyze(prompt.template).issues;
  if (templateIssues.length > 0) {
    return {
      ok: false,
      problem: 'invalid-template',
      message: [
        `Prompt '${prompt.name}' has a template that will not render.`,
        ...templateIssues.map((issue) => `  ${issue.message}`),
        `Run: verify '${prompt.name}'`,
      ].join('\n'),
      missing: [],
    };
  }

  // The full file-level rules, not just the grammar. Without this a template
  // referencing an undeclared variable rendered anyway, substituting nothing,
  // and the run silently lost the value the author expected. Refusing here is
  // cheaper than debugging a commit that is missing a file.
  const verified = Prompts.verifyPrompt(prompt);
  if (!verified.valid) {
    return {
      ok: false,
      problem: 'invalid-prompt',
      message: [
        `Prompt '${prompt.name}' does not pass verification, so it will not run.`,
        Prompts.verifyReport(prompt.name, verified),
        `Run: verify '${prompt.name}'`,
      ].join('\n'),
      missing: [],
    };
  }

  const requested = (request.model ?? '').trim();
  const model = requested === '' ? prompt.model.trim() : requested;
  if (model === '') return missingModel(summary, invocation);

  if (summary.missing.length > 0) return missingVariables(summary, invocation);

  return {
    ok: true,
    prompt: prompt.name,
    model,
    skills: request.skills ?? [...prompt.skills],
    variables: summary.variables,
    text: Prompts.renderToString(prompt.template, prompt.variables, values),
  };
};

/** A resolved execution, as handed to whoever runs the agent. */
export interface ExecutionRequest {
  /** Working directory the run happens in. */
  readonly cwd: string;
  /** Prompt name, for logs and notifications. */
  readonly name: string;
  /** `provider/model-id` to pin. */
  readonly model: string;
  /** The rendered text to send to the agent. */
  readonly text: string;
  /** Skill names to load into the run's context. */
  readonly skills: ReadonlyArray<string>;
}

/**
 * Port that actually runs an agent on a resolved execution. Injected by the
 * consuming extension (Pi's child-agent runtime) so this module stays free of
 * any model dependency, and so tests need no runtime.
 * @param request - the resolved execution
 * @returns Effect resolving to the agent's reply text
 */
export type PromptExecutor = (request: ExecutionRequest) => Effect.Effect<string, string>;
