import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import {
  activeStreamAgents,
  focusAgentStream,
  getActiveLoop,
  runGraph,
} from './graph';
import { openFindingsBrowser } from './findings-browser';
import { runInteractiveSetup } from './interactive';

export { getCurrentGitBranch } from './git';
export { defaultLoopConfig, BUILTIN_REVIEWERS } from './config';

/** Abort controller for the currently running loop (for /adversarial-review-loop-stop). */
let activeLoopController: AbortController | undefined;

/**
 * Pi extension entry: registers the /adversarial-review-loop command (and its
 * stop companion).
 *
 * The command is **interactive-only** — there is no flag-driven CLI path.
 * It opens the TUI wizard (action menu → scope → reviewer roster → settings)
 * and runs the loop from the confirmed setup.
 * @param {ExtensionAPI} pi The Pi extension API
 * @returns Nothing
 */
export default function adversarialReviewLoopExtension(pi: ExtensionAPI): void {
  pi.registerCommand('adversarial-review-loop', {
    description:
      'Run an interactive adversarial review loop: action menu → pick a stored preset ' +
      '(new reviews always start from a preset; the reviewer roster + settings live in ' +
      'presets) → scope (git unstaged or a picked place) → run. Interrupted loops can be ' +
      'resumed in place (pick an existing review from the action menu). Presets are created, ' +
      'listed (ASCII config view with modify/delete), and managed from the wizard, and ' +
      'persist a roster+settings configuration to .agents/review-presets/. The ' +
      'supervisor (brief + aggregate) is always on. Stop with /adversarial-review-loop-stop ' +
      '(or Ctrl+C/Esc in the TUI). Interactive-only (TUI). Skills ship with the extension ' +
      'under skills/.',
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify(
          'adversarial-review-loop is interactive-only — run it inside the pi TUI.',
          'error',
        );
        return;
      }
      await handleInteractive(pi, ctx);
    },
  });

  pi.registerShortcut('ctrl+shift+f', {
    description: 'Inspect a running agent: focus the loop widget on its live stream ' +
      '(adversarial-review-loop)',
    handler: async (ctx) => {
      if (getActiveLoop() === undefined) {
        ctx.ui.notify('No adversarial review loop is currently running.', 'warning');
        return;
      }
      await openAgentFocusPicker(ctx);
    },
  });

  pi.registerShortcut('ctrl+shift+i', {
    description:
      'Inspect issues (adversarial-review-loop): open the findings table — id · ' +
      'severity · title with status, attempts, fixer, and description',
    handler: async (ctx) => {
      const reviewFile = getActiveLoop()?.reviewFile;
      if (reviewFile === undefined) {
        ctx.ui.notify('No adversarial review loop is currently running.', 'warning');
        return;
      }
      await openFindingsBrowser(ctx, reviewFile);
    },
  });

  pi.registerCommand('adversarial-review-loop-stop', {
    description:
      'Gracefully stop the running adversarial review loop — it stops after the ' +
      'current step (an in-flight agent turn finishes first).',
    handler: async (_args, ctx) => {
      const controller = activeLoopController;
      if (controller === undefined || controller.signal.aborted) {
        ctx.ui.notify('No adversarial review loop is currently running.', 'info');
        return;
      }
      controller.abort();
      ctx.ui.notify(
        'Adversarial review loop stop requested — it will stop after the current step.',
        'warning',
      );
    },
  });

  pi.registerCommand('adversarial-review-loop-focus', {
    description:
      'Inspect one running agent\'s live stream — ' +
      '/adversarial-review-loop-focus [agent|off] (no arg opens the interactive ' +
      'picker; off returns to the roster view).',
    handler: async (args, ctx) => {
      const handle = getActiveLoop();
      if (handle === undefined) {
        ctx.ui.notify('No adversarial review loop is currently running.', 'info');
        return;
      }
      const arg = (args ?? '').trim().toLowerCase();
      if (arg === 'off' || arg === 'none' || arg === 'roster') {
        focusAgentStream(undefined);
        ctx.ui.notify('[adversarial-review-loop] Widget back to the roster view.', 'info');
        return;
      }
      if (arg !== '') {
        const known = activeStreamAgents().some((agent) => agent.key === arg);
        if (!known) {
          ctx.ui.notify(`[adversarial-review-loop] No active agent stream '${arg}'.`, 'warning');
          return;
        }
        focusAgentStream(arg);
        ctx.ui.notify(`[adversarial-review-loop] Inspecting ${arg}.`, 'info');
        return;
      }
      await openAgentFocusPicker(ctx);
    },
  });

  pi.registerCommand('adversarial-review-loop-findings', {
    description:
      'Inspect issues: open the interactive findings table for the running review — ' +
      'id · severity · title, with each finding\'s status, attempts, fixer (live tool), ' +
      'location, problem, impact, suggestion, and discussion. Type to filter, ↑↓ to ' +
      'navigate (detail pane updates live), enter/esc to close. Same as the ctrl+shift+i ' +
      'shortcut.',
    handler: async (_args, ctx) => {
      const reviewFile = getActiveLoop()?.reviewFile;
      if (reviewFile === undefined) {
        ctx.ui.notify('No adversarial review loop is currently running.', 'info');
        return;
      }
      await openFindingsBrowser(ctx, reviewFile);
    },
  });
}

/**
 * Opens the interactive agent picker: lists the agents that have produced
 * stream output so far and focuses the widget on the chosen one (or returns
 * to the roster view). Shared by the `/adversarial-review-loop-focus` command
 * (no arg) and the `ctrl+shift+f` shortcut.
 * @param {object} ctx A UI context with select + notify
 * @returns Nothing
 */
const openAgentFocusPicker = async (ctx: {
  readonly ui: Pick<ExtensionCommandContext['ui'], 'select' | 'notify'>;
}): Promise<void> => {
  const agents = activeStreamAgents();
  if (agents.length === 0) {
    ctx.ui.notify('[adversarial-review-loop] No agents are streaming yet.', 'warning');
    return;
  }
  const pick = await ctx.ui.select(
    'Inspect which agent? (widget shows its live stream)',
    [...agents.map((agent) => `${agent.key} — ${agent.label}`), '— back to roster view'],
  );
  if (pick === undefined) return;
  if (pick === '— back to roster view') {
    focusAgentStream(undefined);
    return;
  }
  const key = pick.split(' — ')[0] ?? '';
  if (key !== '') {
    focusAgentStream(key);
    ctx.ui.notify(`[adversarial-review-loop] Inspecting ${key}.`, 'info');
  }
};

/**
 * Interactive mode: run the setup wizard, then the loop. Cancelled setups
 * return without running. The loop is stoppable via the abort signal: the
 * `/adversarial-review-loop-stop` command and a raw terminal listener for
 * Ctrl+C / Esc both fire it; the graph checks it between steps and stops
 * gracefully (disposing the supervisor and clearing the widget).
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
        ctx.ui.notify('[adversarial-review-loop] Stopped by user request.', 'warning');
      }
    } finally {
      unlisten();
      if (activeLoopController === controller) activeLoopController = undefined;
    }
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
  }
};
