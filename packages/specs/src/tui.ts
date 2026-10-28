// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID } from './server.js';

/** The picker has its own name; `/specs` stays the server command. */
const TUI_COMMAND_NAME = 'specs-tui';

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
  setup: (context: any) => {
    registerPicker(context, {
      commandName: TUI_COMMAND_NAME,
      forwardCommandName: 'specs',
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
      prepareForward: async (args, pickerContext) => {
        if (!/^execute(?:\s|$)/u.test(args) || /(?:^|\s)--mode(?:\s|=|$)/u.test(args)) {
          return args;
        }
        const mode = await pickerContext.ui.dialog.select({
          title: 'Execution mode',
          placeholder: 'How should the orchestrator act?',
          options: [
            {
              title: 'Guided',
              value: 'guided',
              description: 'Ask whenever a decision benefits from the human.',
            },
            {
              title: 'Autonomous',
              value: 'autonomous',
              description: 'Ask only for destructive, dangerous, or undecidable calls.',
            },
          ],
        });
        return mode === undefined ? undefined : `${args} --mode ${mode}`;
      },
    });
    return () => {};
  },
} satisfies TuiPlugin;
