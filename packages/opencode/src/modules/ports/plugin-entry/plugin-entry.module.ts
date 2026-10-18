import type { Plugin } from '@opencode/plugin/effect';
import type { Effect, Scope } from 'effect';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- `makePorts` is a plain factory over the host context, not an Effect service; B002 §6 rejects a Layer here.
import { makePorts } from '../ports.module.js';
import type { Ports } from '../ports.module.js';

/** The server plugin context the host passes to `Plugin.effect`. */
export type PluginContext = Plugin.Context;

/** The montflow spelling of the host Effect plugin contract. */
export type MontflowPlugin<R = Scope.Scope> = Plugin.Plugin<R>;

/** Cleanup returned from a TUI plugin `setup`. */
export type TuiCleanup = () => Promise<void> | void;

/**
 * The host TUI context handed to `setup`. Opaque in the adapter for now — no
 * TUI port reads it yet, so C005 widens it when the workspace seams land.
 */
export type TuiPluginContext = Record<string, never>;

/** The structural shape of a host TUI plugin definition. */
export interface TuiPlugin {
  readonly id: string;
  readonly setup: (context: TuiPluginContext) => Promise<TuiCleanup | void> | TuiCleanup | void;
}

/**
 * Build a host Effect plugin from a montflow program. The program receives the
 * seam ports; its requirement stays exactly the host-injected `Scope.Scope`.
 */
export const entry = <R = Scope.Scope>(
  id: string,
  program: (ports: Ports) => Effect.Effect<void, never, R>,
): Plugin.Plugin<R> => ({
  id,
  effect: (context) => program(makePorts(context)),
});
