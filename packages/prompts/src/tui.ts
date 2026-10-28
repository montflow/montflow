// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { readdir, readFile } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { Effect, Schema } from 'effect';
import * as Prompts from './modules/prompts/index.js';
import { ID } from './server.js';

/** The picker has its own name; `/mf-prompts` stays the headless server command. */
const TUI_COMMAND_NAME = 'mf-prompts-tui';

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

export default {
  id: ID,
  setup: (context: any) => {
    registerPicker(context, {
      commandName: TUI_COMMAND_NAME,
      forwardCommandName: 'mf-prompts',
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
        for (const variable of prompt.variables) {
          if (variable.default !== '') {
            values[variable.name] = variable.default;
            continue;
          }
          // oxlint-disable-next-line no-await-in-loop -- dialogs must be answered in declaration order.
          const entered = await pickerContext.ui.dialog.prompt({
            title: variable.label,
            description: variable.description,
            placeholder: variable.required ? 'Required' : 'Optional — leave blank to skip',
            value: '',
          });
          if (entered === undefined) return undefined;
          if (entered === '' && variable.required) {
            pickerContext.ui.toast.show({
              message: `${variable.label} is required.`,
              variant: 'warning',
            });
            return undefined;
          }
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
