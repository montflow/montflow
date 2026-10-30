// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './server.js';

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
  setup: (context: any) => {
    registerPicker(context, {
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
    return () => {};
  },
} satisfies TuiPlugin;
