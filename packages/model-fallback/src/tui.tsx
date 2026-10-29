/** @jsxImportSource @opentui/solid */
import { tuiEntry } from '@montflow/opencode';
import { ModelFallback } from './apps/tui/index.js';

/** Plugin id shared by the server, CLI, and TUI faces. */
export { ID } from './apps/server/index.js';

/**
 * OpenCode TUI plugin entry: one always-mounted `/mf-fallback` command that
 * opens the host's select/confirm dialogs and a summary modal.
 */
export default tuiEntry('model-fallback', (ports) => {
  const slot = ports.grid.slot({
    append: 'app',
    render: () => <ModelFallback.Command ports={ports} />,
  });
  return () => slot();
});
