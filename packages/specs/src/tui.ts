import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The specs surface is the server command
 * (`/specs`); the Pi-era interactive menu is not ported. This face registers
 * the plugin id and mounts nothing — the host still loads both entrypoints
 * from the package.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
