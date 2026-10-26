import type { TuiPlugin } from '@montflow/opencode';
import { ID } from './server.js';

/**
 * OpenCode TUI plugin entry. The references surface is the server command
 * (`/mf-references`) and its tools; a panel is deferred until a package in this
 * repo mounts one. This face registers the plugin id and mounts nothing — the
 * host still loads both entrypoints from the package.
 */
export default {
  id: ID,
  setup: () => () => {},
} satisfies TuiPlugin;
