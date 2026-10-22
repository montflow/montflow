// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- ports are plain factories over the host context, not Effect services; B002 §6 rejects an Effect service/Layer here.
import { makeAgentPort, type AgentContext, type AgentPort } from './agent/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeCommandPort, type CommandContext, type CommandPort } from './command/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeEventPort, type EventContext, type EventPort } from './event/index.js';
import {
  // oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
  makeInteractionPort,
  type InteractionContext,
  type InteractionPort,
} from './interaction/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeModelPort, type ModelContext, type ModelPort } from './model/index.js';
import {
  // oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
  makeSessionDispatchPort,
  type SessionDispatchContext,
  type SessionDispatchPort,
} from './session-dispatch/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeSkillPort, type SkillContext, type SkillPort } from './skill/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeToolPort, type ToolContext, type ToolPort } from './tool/index.js';

/**
 * The host context fields the ports read. The real `Plugin.Context` and
 * `TuiContext` are each assignable; a port built against the wrong half
 * fails only when a method is invoked.
 */
export interface PortsContext
  extends
    CommandContext,
    EventContext,
    InteractionContext,
    ModelContext,
    SessionDispatchContext,
    SkillContext,
    ToolContext,
    AgentContext {}

/** Every seam a plugin program receives; each entry supplies the half it can. */
export interface Ports {
  readonly command: CommandPort;
  readonly event: EventPort;
  readonly interaction: InteractionPort;
  readonly model: ModelPort;
  readonly session: SessionDispatchPort;
  readonly skill: SkillPort;
  readonly tool: ToolPort;
  readonly agent: AgentPort;
  /** Project directory owning the stores the plugin reads. */
  readonly cwd: string;
}

/** Construct the seam ports over a server or TUI host context. */
export const makePorts = (context: PortsContext): Ports => ({
  command: makeCommandPort(context),
  event: makeEventPort(context),
  interaction: makeInteractionPort(context),
  model: makeModelPort(context),
  session: makeSessionDispatchPort(context),
  skill: makeSkillPort(context),
  tool: makeToolPort(context),
  agent: makeAgentPort(context),
  cwd: context.location?.directory ?? process.cwd(),
});
