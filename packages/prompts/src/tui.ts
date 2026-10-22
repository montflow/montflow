import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The prompts surface is served by the server
 * plugin (slash command + tools); the TUI half is present so the host loads
 * both entrypoints, and interactive dialogs attach once the TUI ports land.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
