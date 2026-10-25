import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The profiles surface is the server command
 * (`/mf-profiles`), native agent registration, and the `profile_execute` tool;
 * the Pi-era interactive menu is not ported. This face registers the plugin id
 * and mounts nothing — the host still loads both entrypoints from the package.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
