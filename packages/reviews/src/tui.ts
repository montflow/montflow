import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The reviews surface is served by the server
 * plugin (slash command + `review_create`); the TUI half is present so the
 * host loads both entrypoints, and interactive review panels attach once the
 * TUI ports land.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
