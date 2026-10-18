import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The specs surface is a single server-side slash
 * command for now; the TUI half is present so the host loads both entrypoints
 * from the package and interactive surfaces can attach later.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
