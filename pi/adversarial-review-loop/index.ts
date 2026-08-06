import { Effect } from 'effect';
import { NodeServices } from '@effect/platform-node';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { runGraph } from './graph';
import { validateFeatureSpecFromBranch } from './feature-spec';
import { runInteractiveSetup } from './interactive';
import { BUILTIN_REVIEWERS } from './config';

export { getCurrentGitBranch } from './git';
export { validateFeatureSpecFromBranch } from './feature-spec';
export { defaultLoopConfig, BUILTIN_REVIEWERS, usesSupervisor } from './config';

/**
 * Pi extension entry: registers the /adversarial-review-loop command.
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
      'Run an interactive adversarial review loop: action menu → scope (git unstaged or a ' +
      'picked place) → profile reviewer roster (default: generic) → settings (max loops, ' +
      'models, modes) → run. Interactive-only (TUI). Skills ship with the extension under skills/.',
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
}

/**
 * Interactive mode: run the setup wizard, then the loop. Cancelled setups
 * return without running.
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
    await Effect.runPromise(
      runGraph({
        opts: setup.opts,
        cwd: ctx.cwd,
        ui: ctx.ui,
        validateFeatureSpecFromBranch,
      }).pipe(Effect.provide(NodeServices.layer)),
    );
  } catch (error) {
    ctx.ui.notify(error instanceof Error ? error.message : String(error), 'error');
  }
};
