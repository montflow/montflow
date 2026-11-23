// oxlint-disable-next-line montflow/no-node-platform-imports -- this TUI entry is the composition root for its plugin store.
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry resolves its store path during host setup.
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './server.js';

/** Reviews directory segments. */
const REVIEWS_DIR = ['.agents', '@montflow', 'reviews'] as const;

const loadReviews = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...REVIEWS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const groups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry): Promise<ReadonlyArray<string>> => {
        try {
          const subentries = await readdir(path.join(root, entry.name), { withFileTypes: true });
          return [
            entry.name,
            ...subentries
              .filter((sub) => sub.isDirectory())
              .map((sub) => `${entry.name}/${sub.name}`),
          ];
        } catch {
          return [entry.name];
        }
      }),
  );
  return [...new Set(groups.flat())].toSorted();
};

export default {
  id: ID,
  setup: (context: any) => {
    registerPicker(context, {
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
    return () => {};
  },
} satisfies TuiPlugin;
