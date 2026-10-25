/** @jsxImportSource @opentui/solid */
import { tuiEntry } from '@montflow/opencode';
// oxlint-disable-next-line montflow/no-node-platform-imports -- the TUI entry owns startup IO: one sync layout.json read before the page registers.
import { readFileSync } from 'node:fs';
// oxlint-disable-next-line montflow/no-node-platform-imports -- same boundary: path join for the layout file.
import { join } from 'node:path';
import { PAGE_NAME, SessionChip, WorkspaceCommand } from './contributions.js';
import { pageRenderer } from './grid-page.js';
import { Dashboard } from './modules/index.js';
import { Query } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'workspace';

/** Route name the grid page registers under. */
export const ROUTE = PAGE_NAME;

/**
 * Load the grid layout for a root, falling back to the default when the file
 * is missing or malformed. Read once at setup — edit the file and reopen the
 * page to re-layout.
 * @param root - workspace root
 * @returns grid layout
 */
export const loadLayout = (root: string): Dashboard.Layout => {
  try {
    return Dashboard.decodeLayoutJson(
      readFileSync(join(root, '.agents', '@montflow', 'dashboard', 'layout.json'), 'utf8'),
    );
  } catch {
    return Dashboard.DEFAULT_LAYOUT;
  }
};

/**
 * OpenCode TUI plugin entry: one fullscreen `workspace` route page plus the
 * always-mounted `/workspace` command and session-count chip. The page reuses
 * the native session list, detail, and dispatch — it contributes no session
 * surface of its own.
 */
export default tuiEntry(ID, (ports) => {
  const layout = loadLayout(ports.cwd);
  const client = Query.makeQueryClient();
  const focus = ports.storage.store('workspace', {
    initial: { panel: Dashboard.firstPanel(layout) },
  });
  const page = ports.grid.registerPage({
    name: PAGE_NAME,
    render: pageRenderer({ layout, root: ports.cwd, ports, focus, client }),
  });
  const command = ports.grid.slot({
    append: 'app',
    render: () => <WorkspaceCommand ports={ports} />,
  });
  const chip = ports.grid.slot({
    append: 'home.footer.status',
    render: () => <SessionChip ports={ports} />,
  });

  return () => {
    page();
    command();
    chip();
  };
});
