// oxlint-disable-next-line montflow/no-node-platform-imports -- TUI plugin runs in host context
import { readdir } from 'node:fs/promises';
// oxlint-disable-next-line montflow/no-node-platform-imports -- path needed for store location resolution
import path from 'node:path';
import type { TuiPlugin } from '@montflow/opencode';
import { registerPicker } from '@montflow/opencode/tui';
import { ID, COMMAND_NAME } from './server.js';

/** Reviews directory segments. */
const REVIEWS_DIR = ['.agents', '@montflow', 'reviews'] as const;

const loadReviews = async (directory: string): Promise<ReadonlyArray<string>> => {
  const root = path.join(directory, ...REVIEWS_DIR);
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const reviews: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Look for review series/rounds
      try {
        const subentries = await readdir(path.join(root, entry.name), { withFileTypes: true });
        for (const sub of subentries) {
          if (sub.isDirectory()) {
            reviews.push(`${entry.name}/${sub.name}`);
            continue;
          }
        }
        reviews.push(entry.name);
      } catch {
        reviews.push(entry.name);
      }
    }
  }
  return [...new Set(reviews)].toSorted();
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
