import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { runGraph } from './graph';
import { runInteractiveSetup } from './interactive';
import { startUiServer, stopUiServer, broadcastNotify, getRouterStatus } from './ui-server';
import profilesExtension from './profiles/index';

export { getCurrentGitBranch } from './git';
export { defaultLoopConfig, BUILTIN_REVIEWERS } from './config';

/** Abort controller for the currently running loop (Ctrl+C/Esc graceful stop). */
let activeLoopController: AbortController | undefined;

/**
 * Pi extension entry: registers the /workspace, /montflow, and (merged in)
 * /profiles commands + profile event-bus API.
 *
 * `/montflow` launches the web UI for the current workspace (auto-creating
 * `.agents/@montflow/workspace.json` named after the git branch when missing).
 * `/workspace` is the interactive review-loop wizard; its `ui` subcommand is
 * an alias for `/montflow`.
 * @param {ExtensionAPI} pi The Pi extension API
 * @returns Nothing
 */
export default function workspaceExtension(pi: ExtensionAPI): void {
  // Merged-in @montflow/profiles: /profiles command + profiles:get/list bus.
  profilesExtension(pi);

  pi.registerCommand('workspace', {
    description:
      'Run an interactive adversarial review loop: action menu → pick a stored preset ' +
      '(new reviews always start from a preset; the reviewer roster + settings live in ' +
      'presets) → scope (git unstaged or a picked place) → run. Interrupted loops can be ' +
      'resumed in place (pick an existing review from the action menu). Presets are created, ' +
      'listed (ASCII config view with modify/delete), and managed from the wizard, and ' +
      'persist a roster+settings configuration to .agents/@montflow/review-presets/. The ' +
      'supervisor (brief + aggregate) is always on. Stop with Ctrl+C/Esc in the TUI. ' +
      'Subcommand `ui` launches the shared web UI (single router, folder picker) — same ' +
      'as /montflow; `ui --stop` stops the router. Interactive-only (TUI). Skills ship ' +
      'with the extension under skills/.',
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
      'port. `kill` ends every registered session and stops the router ' +
      '(e.g. `/montflow kill`). `stop` and `status` work too: `/montflow stop`, ' +
      '`/montflow status`.',
    handler: async (args, ctx) => {
      await dispatchCommand(pi, `/montflow${args === '' ? '' : ` ${args}`}`, ctx);
    },
  });
}

/**
 * Routes a `/workspace` or `/montflow` invocation: `ui` subcommand or
 * `--flags` → web UI, anything else → the interactive wizard (only for
 * `/workspace`). Accepts the full slash-command text (as sent from the
 * browser over the router) or the args after the command name.
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
  const command = match[1] ?? 'workspace';
  const rest = (match[2] ?? '').trim();
  const first = rest.split(/\s+/)[0] ?? '';

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

  // `/montflow stop` (with or without `--`) stops the router gracefully.
  if (rest.split(/\s+/).includes('stop')) {
    const stopped = await stopUiServer();
    ctx.ui.notify(stopped ? 'UI router stopped' : 'No UI router is running', 'info');
    return;
  }

  // `/montflow status` reports whether the UI router is running.
  if (first === 'status' || rest.split(/\s+/).includes('status')) {
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

  // `/montflow` always launches the web UI; `/workspace ui …` or any
  // `--flags` (e.g. `/montflow --stop`) do too. Only bare `/workspace`
  // opens the interactive wizard.
  if (command === 'montflow' || first === 'ui' || first.startsWith('--')) {
    await handleUiCommand(
      pi,
      rest,
      ctx,
      command === 'montflow' ? 'Montflow UI' : 'Adversarial review UI',
    );
    return;
  }

  if (!ctx.hasUI) {
    ctx.ui.notify(
      'workspace is interactive-only — run it inside the pi TUI.',
      'error',
    );
    return;
  }
  await handleInteractive(pi, ctx);
}

/**
 * Parses the UI flags (--port=NNNN, --stop) and starts the web UI (reusing
 * the running router when there is one). The workspace marker
 * (`.agents/@montflow/workspace.json`) is auto-created with the git branch
 * name when missing.
 * @param {ExtensionAPI} pi Pi extension API
 * @param {string} rest Arguments after the command name
 * @param {ExtensionCommandContext} ctx Command context
 * @param {string} label Display name for the UI in notifications
 * @returns Nothing
 */
async function handleUiCommand(
  pi: ExtensionAPI,
  rest: string,
  ctx: ExtensionCommandContext,
  label: string,
): Promise<void> {
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
      initiator: label === 'Montflow UI' ? '/montflow' : '/workspace ui',
    });
    ctx.ui.notify(`${label} for '${handle.name}' available at ${handle.url}`, 'info');
    broadcastNotify(`${label} available: ${handle.url}`, 'info');
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
  }
}

/**
 * Interactive mode: run the setup wizard, then the loop. Cancelled setups
 * return without running. The loop is stoppable via the abort signal: a raw
 * terminal listener for Ctrl+C / Esc fires it; the graph checks it between
 * steps and stops gracefully (disposing the supervisor and clearing the widget).
 * @param {ExtensionAPI} pi The Pi extension API
 * @param {ExtensionCommandContext} ctx The command context
 * @returns Nothing
 */
const handleInteractive = async (
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
): Promise<void> => {
  try {
    const setup = await runInteractiveSetup(pi, ctx);
    if (setup === null) return;

    const controller = new AbortController();
    activeLoopController = controller;
    const unlisten = ctx.ui.onTerminalInput((data) => {
      // Ctrl+C (\x03) or Esc (\x1b) while the loop runs → graceful stop.
      if (data === '\x03' || data === '\x1b') {
        if (!controller.signal.aborted) {
          controller.abort();
          ctx.ui.notify(
            'Adversarial review loop stop requested — it will stop after the current step.',
            'warning',
          );
        }
        return { consume: true };
      }
      return undefined;
    });

    try {
      const result = await Effect.runPromise(
        runGraph(
          {
            opts: setup.opts,
            cwd: ctx.cwd,
            ui: ctx.ui,
            signal: controller.signal,
          },
          {
            // Mid-run cycle-max decision: raise the cycle cap, advance to the
            // next loop (or add a loop at the cap), or stop.
            askUser: async (question, options) =>
              (await ctx.ui.select(question, [...options])) ?? null,
          },
        ).pipe(Effect.provide(NodeServices.layer)),
      );
      if (result.terminal === 'stopped') {
        ctx.ui.notify('[workspace] Stopped by user request.', 'warning');
      }
    } finally {
      unlisten();
      if (activeLoopController === controller) activeLoopController = undefined;
    }
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
  }
};
