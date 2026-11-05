import * as Vitest from '@effect/vitest';
import type { Prompts } from '../../services/index.js';
import { conditionText, promptVariableLines } from '../prompt-conditions.js';

/** One variable inside a prompt row. */
type PromptVariable = Prompts.PromptSummary['variables'][number];

/** Build a resolved variable; fields left out take the schema defaults. */
const variable = (fields: Partial<PromptVariable> & { readonly name: string }): PromptVariable => ({
  label: fields.name,
  description: '',
  type: 'text',
  required: true,
  default: '',
  ...fields,
});

const variables = [
  variable({ name: 'isolated', label: 'Isolated branch?', type: 'select', options: ['yes', 'no'] }),
  variable({
    name: 'origin',
    label: 'Origin',
    type: 'select',
    options: ['current', 'main', 'other'],
    when: { controller: 'isolated', equals: 'yes' },
  }),
  variable({
    name: 'worktree',
    label: 'Worktree name',
    type: 'text',
    when: { controller: 'isolated', truthy: true },
  }),
];

Vitest.describe('conditionText', () => {
  Vitest.it('renders the controller and the value', () => {
    const origin = variables[1];
    if (origin === undefined) throw new Error('fixture missing origin');
    Vitest.expect(conditionText(origin)).toBe('when isolated = yes');
  });

  Vitest.it('renders a truthy condition as a boolean check', () => {
    const worktree = variables[2];
    if (worktree === undefined) throw new Error('fixture missing worktree');
    Vitest.expect(conditionText(worktree)).toBe('when isolated is true');
  });

  Vitest.it('has no text for an always-visible variable', () => {
    const isolated = variables[0];
    if (isolated === undefined) throw new Error('fixture missing isolated');
    Vitest.expect(conditionText(isolated)).toBeUndefined();
  });
});

Vitest.describe('promptVariableLines', () => {
  Vitest.it('marks a currently hidden variable without touching its value', () => {
    const lines = promptVariableLines(variables, new Set(['origin']));
    Vitest.expect(lines).toStrictEqual([
      'Isolated branch?',
      'Origin — when isolated = yes · hidden',
      'Worktree name — when isolated is true',
    ]);
    Vitest.expect(variables[1]?.when).toStrictEqual({ controller: 'isolated', equals: 'yes' });
  });

  Vitest.it('drops the hidden marker when the controller now shows the variable', () => {
    Vitest.expect(promptVariableLines(variables, new Set())[1]).toBe(
      'Origin — when isolated = yes',
    );
  });
});
