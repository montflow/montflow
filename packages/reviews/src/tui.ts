// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin, TuiPluginContext } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './ids.js';

/** Reviews directory segments. */
const REVIEWS_DIR = ['.agents', '@montflow', 'reviews'] as const;

const loadReviews = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...REVIEWS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<ReadonlyArray<string>> => {
        const subentries = await readdir(path.join(root, entry.name), {
          withFileTypes: true,
        }).catch(() => []);
        const rounds = subentries
          .filter((sub) => sub.isDirectory())
          .map((sub) => `${entry.name}/${sub.name}`);
        return [entry.name, ...rounds];
      }),
  );
  return [...new Set(nested.flat())].toSorted();
};

export default {
  id: ID,
  setup: (context: TuiPluginContext) => {
    const cleanup = registerPicker(context, {
      commandName: COMMAND_NAME,
      title: 'Reviews',
      description: 'Pick a review',
      group: 'Reviews',
      loadItems: loadReviews,
      formatItem: (review: string) => ({
        title: review,
        value: review,
      }),
      getInsertText: (review: string) => review,
      forwardNonListToServer: true,
    });
    return cleanup;
  },
} satisfies TuiPlugin;
