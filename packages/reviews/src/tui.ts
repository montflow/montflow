import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The reviews surface is the server command
 * (`/mf-reviews`) plus the `review_create` tool; the Pi-era interactive menus
 * are not ported. This face registers the plugin id and mounts nothing — the
 * host still loads both entrypoints from the package.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
