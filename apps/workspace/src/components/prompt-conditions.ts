import type { Prompts } from '../services/index.js';

/** One variable inside a prompt row. */
type PromptVariable = Prompts.PromptSummary['variables'][number];

/**
 * Render one variable's condition for the detail view: the controller and the
 * value it compares against. Undefined for an always-visible variable.
 * @param variable - declared variable
 * @returns the condition as prose, or undefined when there is none
 */
export const conditionText = (variable: PromptVariable): string | undefined => {
  const when = variable.when;
  if (when === undefined) return undefined;
  if (when.equals !== undefined) return `when ${when.controller} = ${when.equals}`;
  if (when.truthy === true) return `when ${when.controller} is true`;
  return `when ${when.controller} (invalid condition)`;
};

/**
 * One line per declared variable for the prompt detail: its label, its
 * condition when it has one, and a `hidden` marker for a variable the current
 * answers hide. The stored value is never changed — the marker is visibility
 * only.
 * @param variables - declared variables, in order
 * @param hidden - names hidden by the current answers
 * @returns one display line per variable
 */
export const promptVariableLines = (
  variables: ReadonlyArray<PromptVariable>,
  hidden: ReadonlySet<string> = new Set<string>(),
): ReadonlyArray<string> =>
  variables.map((variable) => {
    const marks = [conditionText(variable)].filter((mark) => mark !== undefined);
    if (hidden.has(variable.name)) marks.push('hidden');
    return marks.length === 0 ? variable.label : `${variable.label} — ${marks.join(' · ')}`;
  });
