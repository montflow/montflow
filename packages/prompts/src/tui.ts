// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context; keep node APIs local with justification
import { readdir, readFile } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin, TuiPluginContext } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { Option, Schema } from 'effect';
import * as Prompts from './modules/prompts/index.js';
import { ID, COMMAND_NAME } from './ids.js';

const decodeStoredPrompt = Schema.decodeUnknownOption(Prompts.FromJson);

/** Read and decode one prompt file; malformed or unreadable files are skipped. */
const readPromptFile = async (filePath: string): Promise<Prompts.Prompt | undefined> => {
  const raw = await readFile(filePath, 'utf8').catch(() => undefined);
  if (raw === undefined) return undefined;
  return Option.getOrUndefined(decodeStoredPrompt(raw));
};

/**
 * Directory the picker reads. Mirrors `PromptStore.storeLayout`: the current
 * store wins, the retired store is a read-only fallback until `doctor` moves it.
 */
const resolveStoreDir = async (directory: string): Promise<string> => {
  const current = path.join(directory, ...Prompts.STORE_SEGMENTS);
  const legacy = path.join(directory, ...Prompts.LEGACY_STORE_SEGMENTS);
  const currentExists = await readdir(current)
    .then(() => true)
    .catch(() => false);
  if (currentExists) return current;
  const legacyExists = await readdir(legacy)
    .then(() => true)
    .catch(() => false);
  return legacyExists ? legacy : current;
};

/** Every stored prompt the picker can paste, sorted by name. */
const loadPrompts = async (directory: string): Promise<ReadonlyArray<Prompts.Prompt>> => {
  const root = await resolveStoreDir(directory);
  const entries = await readdir(root).catch(() => []);
  const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
  const prompts = await Promise.all(files.map((file) => readPromptFile(path.join(root, file))));
  return prompts
    .filter((prompt): prompt is Prompts.Prompt => prompt !== undefined)
    .toSorted((a, b) => a.name.localeCompare(b.name));
};

export default {
  id: ID,
  setup: (context: TuiPluginContext) => {
    const cleanup = registerPicker(context, {
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
      forwardNonListToServer: true,
    });
    return cleanup;
  },
} satisfies TuiPlugin;
