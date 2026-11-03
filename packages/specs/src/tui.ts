// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { access, readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './server.js';

/** Specs directory segments. */
const SPECS_DIR = ['.agents', '@montflow', 'specs'] as const;

/**
 * List the spec directories under `<workspace>/.agents/@montflow/specs`.
 * A spec is exactly a directory holding `SPEC.md`; phase and task directories
 * never qualify, so the picker can never offer one as a spec. The selected
 * name is forwarded unchanged.
 * @param directory - workspace root
 * @returns spec slugs, sorted
 */
export const loadSpecs = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...SPECS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const checked = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const marker = path.join(root, entry.name, 'SPEC.md');
        const present = await access(marker).then(
          () => true,
          () => false,
        );
        return present ? entry.name : undefined;
      }),
  );
  return checked.filter((name): name is string => name !== undefined).toSorted();
};

export default {
  id: ID,
  setup: (context: any) => {
    registerPicker(context, {
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
