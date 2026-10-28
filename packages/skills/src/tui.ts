// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin, TuiPluginContext } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './ids.js';

/** Skills directory segments. */
const SKILLS_DIR = ['.agents', 'skills'] as const;

const loadSkills = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...SKILLS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const skills: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      skills.push(entry.name);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      skills.push(entry.name.replace(/\.md$/, ''));
    }
  }
  return skills.toSorted();
};

export default {
  id: ID,
  setup: (context: TuiPluginContext) => {
    const cleanup = registerPicker(context, {
      commandName: COMMAND_NAME,
      title: 'Skills',
      description: 'Pick a skill',
      group: 'Skills',
      loadItems: loadSkills,
      formatItem: (skill: string) => ({
        title: skill,
        value: skill,
      }),
      getInsertText: (skill: string) => skill,
      forwardNonListToServer: true,
    });
    return cleanup;
  },
} satisfies TuiPlugin;
