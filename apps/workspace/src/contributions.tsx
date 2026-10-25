/** @jsxImportSource @opentui/solid */
import type { TuiPorts } from '@montflow/opencode';
import { createMemo } from 'solid-js';
import { palette } from './components/index.js';

/** Page name the grid registers with, and the route a command navigates to. */
export const PAGE_NAME = 'workspace';

export interface ContributionProps {
  readonly ports: TuiPorts;
}

/**
 * Always-mounted contribution: the `/workspace` slash command and keybind,
 * reachable from every route. Renders nothing — the page owns the screen.
 *
 * The keymap layer is created inside a slot render because the host ties
 * layer lifetime to the component that created it; a layer built in `setup`
 * would never be owned and never cleaned up.
 */
export const WorkspaceCommand = (props: ContributionProps) => {
  props.ports.grid.keymapLayer(() => ({
    mode: 'global',
    commands: [
      {
        id: 'workspace.open',
        title: 'Open the workspace grid',
        description: 'Montflow dashboard: info, skills, prompts, profiles, and specs',
        group: 'Workspace',
        slash: { name: 'workspace' },
        bind: 'ctrl+w',
        run: () => {
          props.ports.grid.navigate({ type: 'plugin', name: PAGE_NAME });
        },
      },
    ],
  }));
  return null;
};

/**
 * `home.footer.status` chip: session counts read through the host data seam.
 * The native session list stays the only place a session is opened.
 */
export const SessionChip = (props: ContributionProps) => {
  const total = createMemo(() => props.ports.data.sessions().length);
  const running = createMemo(
    () =>
      props.ports.data
        .sessions()
        .filter((session) => props.ports.data.status(session.id) === 'running').length,
  );
  return (
    <text style={{ fg: palette.dim }}>
      {running() > 0 ? `${total()} sessions · ${running()} running` : `${total()} sessions`}
    </text>
  );
};
