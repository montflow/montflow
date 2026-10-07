import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import { DEFAULT_ROOT, runSlash } from './apps/cli/index.js';
import { SpecStore } from './services/index.js';

/** Slash command registered by this extension (invoke as `/mf-specs`). */
export const COMMAND_NAME = 'mf-specs';

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION =
  'Specs: check [--name <spec>] [--verbose] | status --name <spec> | list [--pending | --status <states>] [--verbose].';

/** File-backed store with its platform dependencies hidden. */
const Live: Layer.Layer<SpecStore.SpecStore> = Layer.provide(
  SpecStore.Default,
  Layer.merge(NodeFileSystem.layer, NodePath.layer),
);

/**
 * Run the slash command: resolve the spec root against the session cwd,
 * execute, and notify the rendered report. Verification never needs a
 * model, so this works fully offline inside Pi.
 * @param args - raw slash-command args
 * @param ctx - Pi command context (cwd + ui)
 * @returns Promise settling once the notification is queued
 */
const handler = (args: string, ctx: ExtensionCommandContext): Promise<void> => {
  const root = `${ctx.cwd}/${DEFAULT_ROOT}`;
  return runSlash(args, root).pipe(
    Effect.provide(Live),
    Effect.matchEffect({
      onFailure: (error) =>
        Effect.sync(() => {
          ctx.ui.notify(error.reason, 'error');
        }),
      onSuccess: (report) =>
        Effect.sync(() => {
          ctx.ui.notify(report.output, report.ok ? 'info' : 'error');
        }),
    }),
    Effect.runPromise,
  );
};

/**
 * Pi extension entry: registers `/mf-specs` for mechanically verifying
 * specs. Pure filesystem checks — no model, no network.
 * @param pi - Pi extension API
 * @returns Promise settling once registration completes
 */
export default function piSpecsExtension(pi: ExtensionAPI): Promise<void> {
  return Effect.gen(function* () {
    yield* Effect.sync(() => {
      pi.registerCommand(COMMAND_NAME, { description: COMMAND_DESCRIPTION, handler });
    });
  }).pipe(Effect.runPromise);
}

export { SpecStore };
