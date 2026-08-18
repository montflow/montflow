import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { startUiServer, stopUiServer, restartUiServer, broadcastNotify, getRouterStatus } from './ui-server';
import { registerProfileApi } from './profiles/api';

export { getCurrentGitBranch } from './git';

/**
 * Pi extension entry: registers the `/workspace` and `/montflow` commands plus
 * the merged-in profile event-bus API (profiles:get / profiles:list).
 *
 * Both commands launch the shared web UI for the current workspace
 * (auto-creating `.agents/@montflow/workspace.json` named after the git
 * branch when missing). The UI is served by a single machine-level router
 * daemon that all folders share; the browser is the only render target — the
 * interactive TUI wizard was removed. Profiles are managed from the web UI
 * (manual or agentic runs) and read by extensions over the event bus.
 * @param {ExtensionAPI} pi The Pi extension API
 * @returns Nothing
 */
export default function workspaceExtension(pi: ExtensionAPI): void {
  // Merged-in @montflow/profiles: profiles:get/list event-bus API.
  registerProfileApi(pi);

  pi.registerCommand('workspace', {
    description:
      'Launch the montflow web UI for the current workspace (alias of /montflow). ' +
      'Auto-creates .agents/@montflow/workspace.json (named after the current git ' +
      'branch) when missing, then opens the shared UI (single router, folder ' +
      'picker) at the workspace page. Flags: `--stop` stops the router, ' +
      '`--port=NNNN` pins the port, `restart` restarts the router, `kill` ends ' +
      'every session and stops the router, `status` reports router state.',
    handler: async (args, ctx) => {
      await dispatchCommand(pi, `/workspace${args === '' ? '' : ` ${args}`}`, ctx);
    },
  });

  pi.registerCommand('montflow', {
    description:
      'Launch the montflow web UI for the current workspace. Auto-creates ' +
      '.agents/@montflow/workspace.json (named after the current git branch) when ' +
      'missing, then opens the shared UI (single router, folder picker) at the ' +
      'workspace page. Flags: `--stop` stops the router, `--port=NNNN` pins the ' +
      'port. `restart` stops and restarts the UI (fresh router, same port), ' +
      '`kill` ends every registered session and stops the router ' +
      '(e.g. `/montflow kill`). `stop` and `status` work too: `/montflow stop`, ' +
      '`/montflow status`.',
    handler: async (args, ctx) => {
      await dispatchCommand(pi, `/montflow${args === '' ? '' : ` ${args}`}`, ctx);
    },
  });
}

/**
 * Routes a `/workspace` or `/montflow` invocation: everything opens the web
 * UI, except the lifecycle flags (`kill` / `restart` / `stop` / `status`).
 * Accepts the full slash-command text (as sent from the browser over the
 * router) or the args after the command name.
 * @param {ExtensionAPI} pi Pi extension API
 * @param {string} text Full slash-command text (e.g. `/montflow --stop`)
 * @param {ExtensionCommandContext} ctx Command context
 * @returns Nothing
 */
async function dispatchCommand(
  pi: ExtensionAPI,
  text: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const match = text.trim().match(/^\/(workspace|montflow)(?:\s+(.*))?$/s);
  if (match === null) return; // not one of our commands
  const rest = (match[2] ?? '').trim();

  // `/montflow kill` (any position, e.g. `/montflow --port=24342 kill`) ends
  // every registered session and stops the router. No UI router → nothing to kill.
  if (rest.split(/\s+/).includes('kill')) {
    const killed = await stopUiServer(true);
    ctx.ui.notify(
      killed
        ? 'Montflow killed: all sessions ended and UI router stopped.'
        : 'No UI router is running — nothing to kill.',
      'info',
    );
    return;
  }

  // `/montflow restart` stops the router and starts the UI again for this
  // workspace (fresh router, same port when one was running). Works without
  // the UI running too — it just starts it.
  if (rest.split(/\s+/).includes('restart')) {
    const { flags } = parseUiArgs(rest);
    const portRaw = flags.get('port');
    let port: number | undefined;
    if (portRaw !== undefined) {
      port = parseInt(portRaw, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        ctx.ui.notify(`--port must be 1-65535, got: '${portRaw}'`, 'error');
        return;
      }
    }
    try {
      const handle = await restartUiServer(pi, ctx, {
        port,
        // In-process command dispatch: route like the slash command (no agent turn).
        dispatch: (cmd) => {
          void dispatchCommand(pi, cmd, ctx);
        },
        // What user action started this session (Sessions dropdown).
        initiator: '/montflow restart',
      });
      ctx.ui.notify(
        `Montflow restarted for '${handle.name}' available at ${handle.url}`,
        'info',
      );
      broadcastNotify(`Montflow restarted: ${handle.url}`, 'info');
    } catch (error) {
      ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
    }
    return;
  }

  // `/montflow stop` (with or without `--`) stops the router gracefully.
  if (rest.split(/\s+/).includes('stop')) {
    const stopped = await stopUiServer();
    ctx.ui.notify(stopped ? 'UI router stopped' : 'No UI router is running', 'info');
    return;
  }

  // `/montflow status` reports whether the UI router is running.
  if (rest.split(/\s+/).includes('status')) {
    const status = await getRouterStatus();
    if (!status.running) {
      ctx.ui.notify('Montflow UI: not running — start it with /montflow.', 'info');
      return;
    }
    const folders = status.folders ?? [];
    const lines = [
      'Montflow UI: running',
      `  URL:     http://127.0.0.1:${status.port ?? '?'}/`,
      `  PID:     ${status.pid ?? '?'}`,
      `  Started: ${
        status.startedAt !== undefined
          ? new Date(status.startedAt).toLocaleString()
          : 'n/a'
      }`,
      `  Version: ${status.version ?? '?'}`,
      `  Folders: ${folders.length > 0 ? folders.join(', ') : 'none'}`,
    ];
    ctx.ui.notify(lines.join('\n'), 'info');
    return;
  }

  // Everything else opens the web UI.
  await handleUiCommand(pi, rest, ctx);
}

/**
 * Splits UI args into `--flag=value` pairs and bare `--flag`s (shared by
 * the start/restart command paths). Bare tokens like `restart` are ignored
 * here — they are matched earlier in dispatch.
 * @param {string} rest Arguments after the command name
 * @returns The parsed flags and bare flags
 */
function parseUiArgs(rest: string): {
  readonly flags: Map<string, string>;
  readonly bare: Set<string>;
} {
  const flags = new Map<string, string>();
  const bare = new Set<string>();
  for (const token of rest.split(/\s+/)) {
    if (token === '') continue;
    const eqMatch = token.match(/^--(\w[\w-]*)=(.*)$/);
    if (eqMatch) {
      flags.set(eqMatch[1] ?? '', eqMatch[2] ?? '');
      continue;
    }
    const bareMatch = token.match(/^--(\w[\w-]*)$/);
    if (bareMatch) bare.add(bareMatch[1] ?? '');
  }
  return { flags, bare };
}

/**
 * Parses the UI flags (--port=NNNN, --stop) and starts the web UI (reusing
 * the running router when there is one). The workspace marker
 * (`.agents/@montflow/workspace.json`) is auto-created with the git branch
 * name when missing.
 * @param {ExtensionAPI} pi Pi extension API
 * @param {string} rest Arguments after the command name
 * @param {ExtensionCommandContext} ctx Command context
 * @returns Nothing
 */
async function handleUiCommand(
  pi: ExtensionAPI,
  rest: string,
  ctx: ExtensionCommandContext,
): Promise<void> {
  const { flags, bare } = parseUiArgs(rest);

  if (bare.has('stop')) {
    const stopped = await stopUiServer();
    ctx.ui.notify(stopped ? 'UI router stopped' : 'No UI router is running', 'info');
    return;
  }

  const portRaw = flags.get('port');
  let port: number | undefined;
  if (portRaw !== undefined) {
    port = parseInt(portRaw, 10);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      ctx.ui.notify(`--port must be 1-65535, got: '${portRaw}'`, 'error');
      return;
    }
  }

  try {
    const handle = await startUiServer(pi, ctx, {
      port,
      // In-process command dispatch: route like the slash command (no agent turn).
      dispatch: (text) => {
        void dispatchCommand(pi, text, ctx);
      },
      // What user action started this session (Sessions dropdown).
      initiator: '/montflow',
    });
    ctx.ui.notify(`Montflow UI for '${handle.name}' available at ${handle.url}`, 'info');
    broadcastNotify(`Montflow UI available: ${handle.url}`, 'info');
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
  }
}
