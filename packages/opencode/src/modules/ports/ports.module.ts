// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- ports are plain factories over the host context, not Effect services; B002 §6 rejects an Effect service/Layer here.
import { makeCommandPort, type CommandContext, type CommandPort } from './command/index.js';
import {
  // oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
  makeInteractionPort,
  type InteractionContext,
  type InteractionPort,
} from './interaction/index.js';

/**
 * The host context fields the ports read. The real `Plugin.Context` and
 * `TuiContext` are each assignable; a port built against the wrong half
 * fails only when a method is invoked.
 */
export interface PortsContext extends CommandContext, InteractionContext {}

/** Every seam a plugin program receives; each entry supplies the half it can. */
export interface Ports {
  readonly command: CommandPort;
  readonly interaction: InteractionPort;
}

/** Construct the seam ports over a server or TUI host context. */
export const makePorts = (context: PortsContext): Ports => ({
  command: makeCommandPort(context),
  interaction: makeInteractionPort(context),
});
