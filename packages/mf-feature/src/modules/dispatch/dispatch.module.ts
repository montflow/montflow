import * as Roles from '../roles/index.js';

/**
 * Dispatch: the headless command that runs one seat on another harness.
 *
 * Pure: builds argv, never spawns. Every harness runs its own one-shot mode
 * (`claude -p`, `codex exec`, `opencode run`, `pi -p`) in the workspace, with
 * the brief as the prompt, and prints its final report on stdout.
 */

/** What the dispatched worker may do. */
export type Access = 'write' | 'read-only';

export interface Plan {
  readonly harness: Roles.Harness;
  readonly binary: string;
  readonly args: ReadonlyArray<string>;
  /** Fed on stdin when the harness reads its prompt there. */
  readonly stdin?: string | undefined;
  /** Added to the child's environment. */
  readonly env: Readonly<Record<string, string>>;
}

/** The placeholder a dry run prints in place of the prompt. */
export const PROMPT_PLACEHOLDER = '<brief>';

/**
 * Build the headless command for one candidate.
 * @param candidate - the seat's winning candidate
 * @param prompt - the full brief (profile plus kickoff)
 * @param access - `write` lets the worker edit and run commands; `read-only` does not
 * @returns the plan to spawn
 */
export const plan = (candidate: Roles.Candidate, prompt: string, access: Access): Plan => {
  const { harness, model, effort } = candidate;
  const env = { [Roles.HARNESS_ENV]: harness };
  const binary = Roles.BINARIES[harness];
  switch (harness) {
    case 'claude-code':
      return {
        harness,
        binary,
        env,
        stdin: prompt,
        args: [
          '-p',
          '--model',
          model,
          ...(effort === undefined ? [] : ['--effort', effort]),
          '--permission-mode',
          access === 'write' ? 'auto' : 'plan',
        ],
      };
    case 'codex':
      return {
        harness,
        binary,
        env,
        stdin: prompt,
        args: [
          'exec',
          '--model',
          model,
          ...(effort === undefined ? [] : ['--config', `model_reasoning_effort="${effort}"`]),
          '--sandbox',
          access === 'write' ? 'workspace-write' : 'read-only',
          '-',
        ],
      };
    case 'opencode':
      return {
        harness,
        binary,
        env,
        args: [
          'run',
          '--model',
          effort === undefined ? model : `${model}#${effort}`,
          ...(access === 'write' ? ['--auto'] : ['--agent', 'plan']),
          prompt,
        ],
      };
    case 'pi':
      return {
        harness,
        binary,
        env,
        args: [
          '-p',
          '--model',
          model,
          ...(effort === undefined ? [] : ['--thinking', effort]),
          ...(access === 'write' ? [] : ['--tools', 'read,grep,find,ls']),
          prompt,
        ],
      };
  }
};

/** Quote one argument for display when it is not a plain word. */
const quote = (arg: string): string =>
  /^[\w@%+=:,./#-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;

/**
 * The plan as one shell-like line, with the prompt replaced by a placeholder,
 * for `--dry-run` and logs.
 * @param value - the plan
 * @returns `binary arg …`, quoting args with spaces
 */
export const describe = (value: Plan, prompt: string): string => {
  const args = value.args.map((arg) => (arg === prompt ? PROMPT_PLACEHOLDER : quote(arg)));
  const stdin = value.stdin === undefined ? '' : ` < ${PROMPT_PLACEHOLDER}`;
  return `${value.binary} ${args.join(' ')}${stdin}`;
};

/**
 * Strip a Markdown file's leading frontmatter block.
 * @param raw - the file's bytes
 * @returns the body, trimmed
 */
export const body = (raw: string): string => {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(raw);
  return (match === null ? raw : raw.slice(match[0].length)).trim();
};

/**
 * The prompt a dispatched worker receives: its profile's instructions, then
 * the kickoff brief.
 * @param profile - the profile's body, or undefined for none
 * @param brief - the kickoff the lead wrote
 * @returns the full prompt
 */
export const prompt = (profile: string | undefined, brief: string): string =>
  profile === undefined ? brief.trim() : `${profile}\n\n---\n\n# Task\n\n${brief.trim()}\n`;
