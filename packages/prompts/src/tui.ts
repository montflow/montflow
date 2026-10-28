// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context; keep node APIs local with justification
import { readdir, readFile } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './server.js';

/** Store directory segments under a working directory. */
const PROMPTS_DIR = ['.agents', '@montflow', 'prompts'] as const;

/** Legacy store directory segments. */
const LEGACY_PROMPTS_DIR = ['.agents', '@montflow', 'pi-prompts'] as const;

interface StoredPrompt {
  readonly name: string;
  readonly description: string;
  readonly template: string;
}

const loadPrompts = async (directory: string): Promise<readonly StoredPrompt[]> => {
  const root = path.join(directory, ...PROMPTS_DIR);
  const legacyRoot = path.join(directory, ...LEGACY_PROMPTS_DIR);
  let entries: string[] = [];
  try {
    entries = await readdir(root);
  } catch {
    try {
      entries = await readdir(legacyRoot);
      const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
      const prompts = await Promise.all(
        files.map(async (file): Promise<StoredPrompt | undefined> => {
          const raw = await readFile(path.join(legacyRoot, file), 'utf8').catch(() => undefined);
          if (raw === undefined) return undefined;
          try {
            const parsed = JSON.parse(raw) as {
              name?: unknown;
              description?: unknown;
              template?: unknown;
            };
            if (typeof parsed.name !== 'string' || typeof parsed.template !== 'string')
              return undefined;
            return {
              name: parsed.name,
              description: typeof parsed.description === 'string' ? parsed.description : '',
              template: parsed.template,
            };
          } catch {
            return undefined;
          }
        }),
      );
      return prompts.filter((prompt): prompt is StoredPrompt => prompt !== undefined);
    } catch {
      return [];
    }
  }
  const files = entries.filter((entry) => entry.endsWith('.json')).toSorted();
  const prompts = await Promise.all(
    files.map(async (file): Promise<StoredPrompt | undefined> => {
      const raw = await readFile(path.join(root, file), 'utf8').catch(() => undefined);
      if (raw === undefined) return undefined;
      try {
        const parsed = JSON.parse(raw) as {
          name?: unknown;
          description?: unknown;
          template?: unknown;
        };
        if (typeof parsed.name !== 'string' || typeof parsed.template !== 'string')
          return undefined;
        return {
          name: parsed.name,
          description: typeof parsed.description === 'string' ? parsed.description : '',
          template: parsed.template,
        };
      } catch {
        return undefined;
      }
    }),
  );
  return prompts.filter((prompt): prompt is StoredPrompt => prompt !== undefined);
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
