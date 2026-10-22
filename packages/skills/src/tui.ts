import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The skills surface is the server command
 * (`/mf-skills`), native skill registration, and the `skill_create` /
 * `skill_modify` dispatch tools; the Pi-era interactive menu is not ported.
 * This face registers the plugin id and mounts nothing — the host still loads
 * both entrypoints from the package.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
