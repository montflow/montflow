// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { access, readdir, readFile } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { type PickerContext, registerPicker } from '@montflow/opencode/tui';
import { Effect, Schema } from 'effect';
import * as Prompts from './modules/prompts/index.js';
import { ID, COMMAND_NAME } from './server.js';

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'prompts'] as const;

/** Legacy store directory segments. */
const LEGACY_PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** Read one prompt file, or undefined when it is absent or not decodable. */
const readPrompt = async (root: string, file: string): Promise<Prompts.Prompt | undefined> => {
  const raw = await readFile(path.join(root, file), 'utf8').catch(() => undefined);
  if (raw === undefined) return undefined;
  try {
    return Schema.decodeUnknownSync(Prompts.FromJson)(raw);
  } catch {
    return undefined;
  }
};

/** Read every prompt under a store root, or undefined when the root is absent. */
const readPrompts = async (root: string): Promise<ReadonlyArray<Prompts.Prompt> | undefined> => {
  const entries = await readdir(root).catch(() => undefined);
  if (entries === undefined) return undefined;
  const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
  const prompts = await Promise.all(files.map((file) => readPrompt(root, file)));
  return prompts.filter((prompt): prompt is Prompts.Prompt => prompt !== undefined);
};

const loadPrompts = async (directory: string): Promise<ReadonlyArray<Prompts.Prompt>> => {
  const current = await readPrompts(path.join(directory, ...PROMPTS_DIR));
  if (current !== undefined) return current;
  return (await readPrompts(path.join(directory, ...LEGACY_PROMPTS_DIR))) ?? [];
};

/** Existing spec slugs under the workspace's specs store, sorted. */
const loadSpecNames = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, '.agents', '@montflow', 'specs');
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const names = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<string | undefined> => {
        const hasSpec = await access(path.join(root, entry.name, 'SPEC.md'))
          .then(() => true)
          .catch(() => false);
        return hasSpec ? entry.name : undefined;
      }),
  );
  return names.filter((name): name is string => name !== undefined).toSorted();
};

/** One option in a select dialog. */
interface SelectChoice {
  readonly title: string;
  readonly value: string;
  readonly description?: string;
}

/** Ask for a text variable, re-asking when a required answer is blank. */
const askText = async (
  variable: Prompts.Variable,
  context: PickerContext,
): Promise<string | undefined> => {
  const entered = await context.ui.dialog.prompt({
    title: variable.label,
    description: variable.description,
    placeholder: variable.required ? 'Required' : 'Optional — leave blank to skip',
    value: '',
  });
  if (entered === undefined) return undefined;
  if (entered !== '' || !variable.required) return entered;
  context.ui.toast.show({
    message: `${variable.label} is required.`,
    variant: 'warning',
  });
  return askText(variable, context);
};

export default {
  id: ID,
  setup: (context: any) => {
    registerPicker(context, {
      commandName: COMMAND_NAME,
      title: 'Prompts',
      description: 'Pick a stored prompt',
      group: 'Prompts',
      loadItems: loadPrompts,
      formatItem: (prompt: Prompts.Prompt) => ({
        title: prompt.name,
        value: prompt,
        description: prompt.description,
      }),
      getInsertText: (prompt: Prompts.Prompt) => prompt.template,
      resolveInsertText: async (prompt, pickerContext) => {
        const values: Record<string, string> = {};
        const directory = pickerContext.location?.directory ?? process.cwd();
        for (const variable of prompt.variables) {
          if (variable.source === 'specs') {
            // oxlint-disable-next-line no-await-in-loop -- dialogs must be answered in declaration order.
            const specs = await loadSpecNames(directory);
            const choices: Array<SelectChoice> = specs.map((spec) => ({
              title: spec,
              value: spec,
            }));
            if (!variable.required) choices.push({ title: 'Skip', value: '' });
            if (choices.length === 0) {
              pickerContext.ui.toast.show({
                message: `No specs found under ${path.join(directory, '.agents', '@montflow', 'specs')}.`,
                variant: 'warning',
              });
              return undefined;
            }
            const selectOptions = {
              title: variable.label,
              description: variable.description,
              placeholder: 'Search specs',
              options: choices,
              search: (query: string, options: ReadonlyArray<SelectChoice>) => {
                const needle = query.trim().toLowerCase();
                return needle === ''
                  ? options
                  : options.filter((option) => option.title.toLowerCase().includes(needle));
              },
            };
            // oxlint-disable-next-line no-await-in-loop -- dialogs must be answered in declaration order.
            const chosen = await pickerContext.ui.dialog.select(
              variable.default === ''
                ? selectOptions
                : { ...selectOptions, current: variable.default },
            );
            if (chosen === undefined) return undefined;
            values[variable.name] = chosen;
            continue;
          }
          if (variable.default !== '') {
            values[variable.name] = variable.default;
            continue;
          }
          if (variable.type === 'select') {
            const options = variable.options ?? [];
            const choices = options.map((option) => ({ title: option, value: option }));
            if (!variable.required) choices.push({ title: 'Skip', value: '' });
            const selectOptions = {
              title: variable.label,
              description: variable.description,
              placeholder: 'Choose a value',
              options: choices,
            };
            // oxlint-disable-next-line no-await-in-loop -- dialogs must be answered in declaration order.
            const chosen = await pickerContext.ui.dialog.select(
              variable.default === ''
                ? selectOptions
                : { ...selectOptions, current: variable.default },
            );
            if (chosen === undefined) return undefined;
            values[variable.name] = chosen;
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- dialogs must be answered in declaration order.
          const entered = await askText(variable, pickerContext);
          if (entered === undefined) return undefined;
          values[variable.name] = entered;
        }
        return Prompts.renderPrompt(prompt, values)
          .pipe(Effect.runPromise)
          .catch((cause: unknown) => {
            pickerContext.ui.toast.show({
              message: cause instanceof Error ? cause.message : String(cause),
              variant: 'error',
            });
            return undefined;
          });
      },
      forwardNonListToServer: true,
    });
    return () => {};
  },
} satisfies TuiPlugin;
