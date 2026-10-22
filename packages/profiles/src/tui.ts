import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The profiles surface is served by the server
 * plugin (agent registration, slash command + tool); the TUI half is present
 * so the host loads both entrypoints, and interactive flows attach once the
 * TUI ports land.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
