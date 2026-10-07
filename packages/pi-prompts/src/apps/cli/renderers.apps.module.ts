import * as PromptExecute from '../../modules/prompt-execute/index.js';
import * as Prompts from '../../modules/prompts/index.js';
import * as Doctor from '../doctor/index.js';
import type * as Engines from './engines.apps.module.js';

/**
 * Pure `data -> text` renderers, one per engine result.
 *
 * These carry the **token contract**, because the output is read by agents far
 * more often than by humans:
 *
 * - **Token-lean by default.** A `list` prints names and nothing else; a
 *   passing `verify` prints one line. A reader that only needs to know "is
 *   this fine?" should not have to scroll past a wall of green.
 * - **`--verbose` adds, never removes.** Detail is opt-in, so a lean run is
 *   always a strict subset of a verbose one.
 * - **Failures are never suppressed.** Every problem an engine found appears in
 *   both modes, because a missing error is the expensive failure.
 * - **No ANSI, no colour, no box drawing.** These strings are piped into tool
 *   results, captured in CI logs, and diffed in tests. Escapes would be noise
 *   in all three.
 */

/** One-line usage summary. */
export const USAGE = `mf-prompts — inspect, verify, and execute stored prompt templates.

Usage:
  mf-prompts doctor [--check] [--verbose]
  mf-prompts list [--verbose] [--dir <path>]
  mf-prompts inspect <name> [key=value ...] [--dir <path>]
  mf-prompts execute <name> --model <provider/model-id> [key=value ...] [--dir <path>]
  mf-prompts show <name> [--dir <path>]
  mf-prompts verify <name>|--all [--dir <path>]
  mf-prompts render <name> [key=value ...] [--dir <path>]
  mf-prompts create <name> --template <text> [--description <d>] [--model <p/m>]
                    [--skills a,b] [--variable name[:flags]] [--dir <path>]
  mf-prompts modify <name> [--template <text>] [--description <d>] [--model <p/m>]
                    [--skills a,b] [--variable name[:flags]] [--dir <path>]
  mf-prompts delete <name> [--dir <path>]

Variable specs for --variable: name, name:o (optional), name:d=<text> (default).
Values are key=value pairs; every required variable must be supplied.`;

/** How much detail to print. */
export interface Verbosity {
  /** Add per-item detail. Never hides anything a lean run showed. */
  readonly verbose: boolean;
}

/** `list` options: verbosity plus the active status filter, if any. */
export interface ListOptions extends Verbosity {
  /** The `--status` value in effect, so an empty result can say so. */
  readonly status?: string | undefined;
}

/**
 * Stored prompt names. Lean by default: names only, one per line, because that
 * is what a caller almost always wants to feed back into the next command.
 * @param prompts - prompts from `engines.list`
 * @param options - verbosity plus the active status filter
 * @returns the rendered list
 */
export const list = (
  prompts: ReadonlyArray<Prompts.Prompt>,
  options: ListOptions = { verbose: false },
): string => {
  if (prompts.length === 0) {
    return options.status === undefined
      ? 'No prompts yet. Create one with: mf-prompts create <name> --template "…"'
      : `No prompts with status '${options.status}'.`;
  }
  if (!options.verbose) return prompts.map((prompt) => prompt.name).join('\n');
  return prompts
    .map((prompt) => {
      const required = prompt.variables.filter((variable) => variable.required).length;
      const model = prompt.model === '' ? 'model: (none)' : `model: ${prompt.model}`;
      return [
        prompt.name,
        `  ${prompt.description === '' ? '(no description)' : prompt.description}`,
        `  ${model} · variables: ${prompt.variables.length} (${required} required)`,
      ].join('\n');
    })
    .join('\n\n');
};

/** One prompt's raw template, verbatim. */
export const show = (prompt: Prompts.Prompt): string =>
  prompt.template === '' ? `(prompt '${prompt.name}' has an empty template)` : prompt.template;

/**
 * The variable table, straight from the shared renderer so the CLI, the TUI,
 * the Pi tool, and the skill documentation all show the same bytes.
 */
export const inspect = (summary: PromptExecute.PromptSummary): string =>
  PromptExecute.table(summary);

/**
 * A verification report. Lean mode already reports every issue, so verbose
 * only adds which file was checked — there is no failure detail to withhold,
 * and nothing is hidden from the lean run.
 */
export const verify = (
  name: string,
  result: Prompts.VerifyResult,
  options: Verbosity = { verbose: false },
): string => {
  const report = Prompts.verifyReport(name, result);
  if (!options.verbose) return report;
  return `${report}\n  checked: .agents/@montflow/pi-prompts/${name}.json`;
};

/**
 * A whole-store verification report. Failures are never suppressed; a passing
 * prompt appears only under `verbose`, matching the single-prompt renderer.
 * @param report - report from `engines.verifyAll`
 * @param options - include passing prompts
 * @returns the display text
 */
export const verifyAll = (
  report: Engines.VerifyAllReport,
  options: Verbosity = { verbose: false },
): string => {
  const lines: Array<string> = [];
  for (const entry of report.entries) {
    if (entry.result.valid && !options.verbose) continue;
    lines.push(`${entry.name}: ${Prompts.verifyInfoLine(entry.result)}`);
    for (const found of entry.result.issues) lines.push(`  ${found.field}: ${found.message}`);
  }
  if (report.entries.length === 0) lines.push('No prompts yet.');
  lines.push(
    `${report.entries.length} prompt${report.entries.length === 1 ? '' : 's'} \u00b7 ${report.issueCount} issue${report.issueCount === 1 ? '' : 's'}`,
  );
  return lines.join('\n');
};

/** The full doctor report, one line per skill. */
export const doctor = (result: Doctor.DoctorResult): string => Doctor.doctorMessage(result);

/**
 * The two-line gate message an execution stops on. `invocation` is threaded
 * from the caller so the repair step is spelled the way that front end
 * actually spells it.
 */
export const gate = (result: Doctor.DoctorResult, invocation = '/mf-prompts doctor'): string =>
  Doctor.doctorGateMessage(result, invocation);

/** A prompt was created. */
export const created = (prompt: Prompts.Prompt): string =>
  `Created prompt '${prompt.name}' (${prompt.variables.length} variable(s)).`;

/** A prompt was saved. */
export const saved = (prompt: Prompts.Prompt): string =>
  `Saved prompt '${prompt.name}' (${prompt.variables.length} variable(s)).`;

/** A prompt was deleted. */
export const deleted = (name: string): string => `Deleted prompt '${name}'.`;

/**
 * A refusal from `engines.plan`, with the prompt's variables appended so a
 * caller can see what the plan *would* have needed alongside why it cannot
 * run. Every refusal already names its own fix, so nothing here contradicts it.
 */
export const blocked = (
  plan: PromptExecute.ExecuteBlocked,
  summary: PromptExecute.PromptSummary | undefined,
): string => {
  if (summary === undefined || plan.missing.length === 0) return plan.message;
  return `${plan.message}\n\n${PromptExecute.table(summary)}`;
};
