import type { Prompts } from '@montflow/prompts';

/**
 * One controller the editor may offer for a conditional variable: an earlier
 * `select` (compared with `equals`) or an earlier `confirm` (compared with
 * `truthy`). `values` is what the user may pick — the select's own options, or
 * the confirm's checked answer.
 */
export interface ConditionController {
  readonly name: string;
  readonly label: string;
  readonly form: 'equals' | 'truthy';
  readonly values: ReadonlyArray<string>;
}

/**
 * The controllers allowed at one declaration position. Only earlier entries
 * qualify, and only a discrete kind (`select` or `confirm`) can drive
 * visibility — a text or textarea controller can never be referenced. The
 * declaration order is the renderer's order, so a later controller is refused
 * here rather than discovered at render time.
 * @param variables - the declared variables, in order
 * @param index - position of the conditioned variable
 * @returns the eligible controllers, in declaration order
 */
export const conditionControllers = (
  variables: ReadonlyArray<Prompts.Variable>,
  index: number,
): ReadonlyArray<ConditionController> =>
  variables.slice(0, index).flatMap((variable): ReadonlyArray<ConditionController> => {
    // Widened so the `confirm` arm stays reachable even before that kind is a
    // first-class member of `Variable.type`.
    const type: string = variable.type;
    if (type === 'select') {
      const options = variable.options ?? [];
      if (options.length === 0) return [];
      return [{ name: variable.name, label: variable.label, form: 'equals', values: options }];
    }
    if (type === 'confirm') {
      return [{ name: variable.name, label: variable.label, form: 'truthy', values: ['yes'] }];
    }
    return [];
  });

/**
 * Build the on-disk condition for a picked controller and answer. A select
 * needs one of its options; a confirm needs the checked answer. An unoffered
 * answer returns undefined so the editor never writes a condition the verifier
 * would reject.
 * @param controller - the picked controller
 * @param value - the picked answer
 * @returns the condition, or undefined when the answer is not offered
 */
export const chooseCondition = (
  controller: ConditionController,
  value: string,
): Prompts.VariableCondition | undefined => {
  if (controller.form === 'truthy') {
    return value === 'yes' ? { controller: controller.name, truthy: true } : undefined;
  }
  return controller.values.includes(value)
    ? { controller: controller.name, equals: value }
    : undefined;
};

/** A refused or accepted condition edit; refusals carry the verifier's wording. */
export type ConditionEdit =
  | { readonly ok: true; readonly variables: ReadonlyArray<Prompts.Variable> }
  | { readonly ok: false; readonly message: string };

/**
 * The reason a condition would fail verification, or undefined when it is
 * legal. Mirrors the G001 contract: an unknown controller, a later controller,
 * both forms (or neither), a non-discrete controller, a form that does not
 * match the controller's kind, or an equals value the controller does not
 * offer are all refused.
 * @param variables - the declared variables, in order
 * @param index - position of the conditioned variable
 * @param when - the condition to check
 * @returns the refusal message, or undefined when valid
 */
export const validateCondition = (
  variables: ReadonlyArray<Prompts.Variable>,
  index: number,
  when: Prompts.VariableCondition,
): string | undefined => {
  const target = variables[index];
  if (target === undefined) return `no variable is declared at position ${index}.`;
  const controllerIndex = variables.findIndex((variable) => variable.name === when.controller);
  if (controllerIndex < 0) {
    return `when.controller '${when.controller}' is not a declared variable.`;
  }
  if (controllerIndex >= index) {
    return `'${when.controller}' must be declared before '${target.name}'.`;
  }
  const forms = (when.equals === undefined ? 0 : 1) + (when.truthy === undefined ? 0 : 1);
  if (forms !== 1) {
    return `'${target.name}' "when" must carry exactly one of "equals" or "truthy".`;
  }
  const controller = variables[controllerIndex];
  if (controller === undefined) return `'${when.controller}' is not a declared variable.`;
  // Widened for the same reason as `conditionControllers`.
  const type: string = controller.type;
  if (type !== 'select' && type !== 'confirm') {
    return `when.controller '${when.controller}' has type ${type}.`;
  }
  if (when.equals !== undefined) {
    if (type !== 'select') return 'truthy requires confirm; equals requires select.';
    if (!(controller.options ?? []).includes(when.equals)) {
      return `'${when.equals}' is not an option of '${when.controller}'.`;
    }
    return undefined;
  }
  return type === 'confirm' ? undefined : 'truthy requires confirm; equals requires select.';
};

/**
 * Apply a condition to one variable, refusing anything {@link validateCondition}
 * rejects. The rest of the list is untouched, so dependents keep their own
 * conditions and the editor can offer one controller pick at a time.
 * @param variables - the declared variables, in order
 * @param index - position of the conditioned variable
 * @param when - the condition to apply
 * @returns the edited list, or the refusal
 */
export const applyCondition = (
  variables: ReadonlyArray<Prompts.Variable>,
  index: number,
  when: Prompts.VariableCondition,
): ConditionEdit => {
  const problem = validateCondition(variables, index, when);
  if (problem !== undefined) return { ok: false, message: problem };
  return {
    ok: true,
    variables: variables.map((variable, at) => (at === index ? { ...variable, when } : variable)),
  };
};

/**
 * Apply a condition picked by name, the shape a dialog flow produces: find the
 * variable, find an eligible earlier controller, turn the picked answer into a
 * condition, then {@link applyCondition}. Every refusal is the same message the
 * verifier-adjacent rules produce, so a UI can surface it verbatim.
 * @param variables - the declared variables, in order
 * @param name - the variable receiving the condition
 * @param controllerName - the earlier controller the user picked
 * @param value - the controller answer the user picked
 * @returns the edited list, or the refusal
 */
export const applyConditionByName = (
  variables: ReadonlyArray<Prompts.Variable>,
  name: string,
  controllerName: string,
  value: string,
): ConditionEdit => {
  const index = variables.findIndex((variable) => variable.name === name);
  if (index < 0) return { ok: false, message: `Unknown variable '${name}'.` };
  const controller = conditionControllers(variables, index).find(
    (candidate) => candidate.name === controllerName,
  );
  if (controller === undefined) {
    return {
      ok: false,
      message: `'${controllerName}' cannot control '${name}'; choose an earlier select or confirm.`,
    };
  }
  const when = chooseCondition(controller, value);
  if (when === undefined) {
    return {
      ok: false,
      message: `'${value}' is not an offered answer for '${controllerName}'.`,
    };
  }
  return applyCondition(variables, index, when);
};
