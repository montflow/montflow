// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin, TuiPluginContext } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './ids.js';

/** Profiles directory segments. */
const PROFILES_DIR = ['.agents', '@montflow', 'profiles'] as const;

const loadProfiles = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...PROFILES_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const profiles: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      profiles.push(entry.name);
    }
  }
  return profiles.toSorted();
};

export default {
  id: ID,
  setup: (context: TuiPluginContext) => {
    const cleanup = registerPicker(context, {
      commandName: COMMAND_NAME,
      title: 'Profiles',
      description: 'Pick a profile',
      group: 'Profiles',
      loadItems: loadProfiles,
      formatItem: (profile: string) => ({
        title: profile,
        value: profile,
      }),
      getInsertText: (profile: string) => profile,
      forwardNonListToServer: true,
    });
    return cleanup;
  },
} satisfies TuiPlugin;
