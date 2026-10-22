import type { Plugin } from '@opencode/plugin/effect';
import type { Effect, Scope } from 'effect';
import {
  // oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- `makePorts` / `makeTuiPorts` are plain factories over the host context, not Effect services; B002 §6 rejects a Layer here.
  makePorts,
  // oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
  makeTuiPorts,
} from '../ports.module.js';
import type { Ports, PortsContext, TuiPortsContext } from '../ports.module.js';

/** The server plugin context the host passes to `Plugin.effect`. */
export type PluginContext = Plugin.Context;

/** The montflow spelling of the host Effect plugin contract. */
export type MontflowPlugin<R = Scope.Scope> = Plugin.Plugin<R>;

/** Cleanup returned from a TUI plugin `setup`. */
export type TuiCleanup = () => Promise<void> | void;

/**
 * The host TUI context handed to `setup`, narrowed to the slices the ports
 * read. The real `Context` carries more (renderer, theme, markdown, client);
 * the seam only names what it consumes, so fakes stay tiny.
 */
export type TuiPluginContext = TuiPortsContext;

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
  effect: (context: PortsContext) => program(makePorts(context)),
});

/**
 * Build a host TUI plugin from a montflow setup. The setup receives the same
 * `Ports` the server face gets, with the client-local seams wired, and returns
 * the host cleanup directly, so a plugin never imports `@opencode/*`.
 */
export const tuiEntry = (
  id: string,
  setup: (ports: Ports, context: TuiPluginContext) => TuiCleanup | void,
): TuiPlugin => ({
  id,
  setup: (context) => setup(makeTuiPorts(context), context),
});
