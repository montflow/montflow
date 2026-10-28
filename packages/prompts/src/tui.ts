// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { readdir, readFile } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { Schema } from 'effect';
import { ID, COMMAND_NAME } from './server.js';

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'prompts'] as const;

/** Legacy store directory segments. */
const LEGACY_PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

/** The fields the picker needs from a stored prompt file. */
const StoredPromptSchema = Schema.Struct({
  name: Schema.String,
  description: Schema.optional(Schema.String),
  template: Schema.String,
});

/** One stored prompt, flattened for the picker. */
interface StoredPrompt {
  readonly name: string;
  readonly description: string;
  readonly template: string;
}

/** Read one prompt file, or undefined when it is absent or not decodable. */
const readPrompt = async (root: string, file: string): Promise<StoredPrompt | undefined> => {
  const raw = await readFile(path.join(root, file), 'utf8').catch(() => undefined);
  if (raw === undefined) return undefined;
  try {
    const parsed = Schema.decodeUnknownSync(StoredPromptSchema)(JSON.parse(raw));
    return {
      name: parsed.name,
      description: parsed.description ?? '',
      template: parsed.template,
    };
  } catch {
    return undefined;
  }
};

/** Read every prompt under a store root, or undefined when the root is absent. */
const readPrompts = async (root: string): Promise<ReadonlyArray<StoredPrompt> | undefined> => {
  const entries = await readdir(root).catch(() => undefined);
  if (entries === undefined) return undefined;
  const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
  const prompts = await Promise.all(files.map((file) => readPrompt(root, file)));
  return prompts.filter((prompt): prompt is StoredPrompt => prompt !== undefined);
};

const loadPrompts = async (directory: string): Promise<ReadonlyArray<StoredPrompt>> => {
  const current = await readPrompts(path.join(directory, ...PROMPTS_DIR));
  if (current !== undefined) return current;
  return (await readPrompts(path.join(directory, ...LEGACY_PROMPTS_DIR))) ?? [];
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
      formatItem: (prompt: StoredPrompt) => ({
        title: prompt.name,
        value: prompt,
        description: prompt.description,
      }),
      getInsertText: (prompt: StoredPrompt) => prompt.template,
      forwardNonListToServer: true,
    });
    return () => {};
  },
} satisfies TuiPlugin;
