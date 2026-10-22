import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The skills surface is served by the server
 * plugin (slash command, skill registry, dispatch tools); the TUI half is
 * present so the host loads both entrypoints, and the interactive menu
 * attaches once the TUI ports land.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
