import { AUTHORING_SPEC, EXECUTING_SPEC } from '../../skills/index.js';

export { AUTHORING_SPEC, EXECUTING_SPEC };

/**
 * Instructions before the user's spec request: the child agent authors
 * exactly one spec, then stops. Transported as the preprompt of the
 * dispatched author run, with {@link AUTHORING_SPEC} injected after
 * it.
 *
 * The run parks on `ask_user` when the agent needs a decision that belongs
 * to the user — the workspace surfaces the parked run and answers it — so
 * this prompt names the tool and bounds its use.
 */
export const AUTHOR_PREPROMPT = `You are a spec author for a pi coding agent.

Author exactly one new spec, then stop. Do not start executing the tasks.

You may ask the user questions when a decision genuinely belongs to them (scope, naming,
ambiguity). Ask with the \`ask_user\` tool — one concise question, then wait; the run parks and
the workspace surfaces it for the user to answer. Decide and proceed otherwise. Keep questions
to the few that matter. Use \`notify_user\` for progress the user should see.`;

/** Instructions after the user's spec request: the reply shape. */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the spec name, its phase count, and the checker verdict.';

/**
 * Instructions before the resume request: the child agent orchestrates one
 * spec to completion, one phase at a time. Transported as the preprompt of
 * the dispatched resume run, with {@link EXECUTING_SPEC} injected
 * after it.
 */
export const RESUME_PREPROMPT = `You are a spec orchestrator for a pi coding agent.

Resume exactly the spec described below and drive it toward completion. Spawn and supervise
agent runs as needed. Park on \`ask_user\` whenever a decision belongs to the user; use
\`notify_user\` for progress the user should see.`;

/** Instructions after the resume context: the reply shape. */
export const RESUME_POSTPROMPT =
  'When done, reply with one short line: the spec name, its new state, and the checker verdict.';

/**
 * Assemble the author run's prompt from the user's spec request:
 * preprompt, the authoring skill, request, postprompt.
 * @param description - the user's spec request text
 * @returns the full prompt dispatched to the author run
 */
export const buildAuthorPrompt = (description: string): string =>
  [AUTHOR_PREPROMPT, AUTHORING_SPEC, `Spec request: ${description.trim()}`, AUTHOR_POSTPROMPT]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n');

/**
 * Assemble the resume run's prompt: preprompt, the executing skill, the
 * spec name and injected state context, postprompt.
 * @param name - spec directory slug to resume
 * @param context - state context the caller gathered (state, active phase, tasks)
 * @returns the full prompt dispatched to the resume run
 */
export const buildResumePrompt = (name: string, context: string): string =>
  [RESUME_PREPROMPT, EXECUTING_SPEC, `Spec: ${name}\n\n${context.trim()}`, RESUME_POSTPROMPT]
    .map((part) => part.trim())
    .filter((part) => part !== '')
    .join('\n\n');
