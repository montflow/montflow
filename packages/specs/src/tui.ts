// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin, TuiPluginContext } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './ids.js';

/** Specs directory segments. */
const SPECS_DIR = ['.agents', '@montflow', 'specs'] as const;

const loadSpecs = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...SPECS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const specs: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Skip phase/review dirs, look for spec dirs (typically contain SPEC.md)
      specs.push(entry.name);
    }
  }
  return specs.toSorted();
};

export default {
  id: ID,
  setup: (context: TuiPluginContext) => {
    const cleanup = registerPicker(context, {
      commandName: COMMAND_NAME,
      title: 'Specs',
      description: 'Pick a spec',
      group: 'Specs',
      loadItems: loadSpecs,
      formatItem: (spec: string) => ({
        title: spec,
        value: spec,
      }),
      getInsertText: (spec: string) => spec,
      forwardNonListToServer: true,
    });
    return cleanup;
  },
} satisfies TuiPlugin;
