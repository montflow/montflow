// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- ports are plain factories over the host context, not Effect services; B002 §6 rejects an Effect service/Layer here.
import { makeAgentPort, type AgentContext, type AgentPort } from './agent/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeCommandPort, type CommandContext, type CommandPort } from './command/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeDataPort, type DataContext, type DataPort } from './data/index.js';
import {
  // oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
  makeGridPagePort,
  type GridPageContext,
  type GridPagePort,
} from './grid-page/index.js';
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
import { makeStoragePort, type StorageContext, type StoragePort } from './storage/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeToolPort, type ToolContext, type ToolPort } from './tool/index.js';
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- same seam: a plain factory, not a Layer-owned service.
import { makeCustomViewPort, type CustomViewPort, type ViewContext } from './view/index.js';

/**
 * The host server context fields the ports read. The real `Plugin.Context` is
 * assignable; the TUI half lives in {@link TuiPortsContext} because the host's
 * two contexts disagree on `ui`, `data`, and `storage` by design.
 */
export interface PortsContext
  extends
    AgentContext,
    CommandContext,
    ModelContext,
    SessionDispatchContext,
    SkillContext,
    ToolContext {}

/**
 * The host TUI context fields the client-local ports read. `ui` and `data` are
 * intersections because one host object serves every TUI port: a narrow `ui`
 * per port would make the merged context unassignable.
 */
export interface TuiPortsContext extends PortsContext {
  readonly ui: NonNullable<ModelContext['ui']> &
    NonNullable<InteractionContext['ui']> &
    NonNullable<ViewContext['ui']> &
    NonNullable<GridPageContext['ui']>;
  readonly data: NonNullable<ModelContext['data']> & NonNullable<DataContext['data']>;
  readonly attention?: NonNullable<InteractionContext['attention']> | undefined;
  readonly keymap?: NonNullable<GridPageContext['keymap']> | undefined;
  readonly storage?: NonNullable<StorageContext['storage']> | undefined;
}

/** Every seam a plugin program receives; each entry supplies the half it can. */
export interface Ports {
  readonly agent: AgentPort;
  readonly command: CommandPort;
  readonly data: DataPort;
  readonly grid: GridPagePort;
  readonly interaction: InteractionPort;
  readonly model: ModelPort;
  readonly session: SessionDispatchPort;
  readonly skill: SkillPort;
  readonly storage: StoragePort;
  readonly tool: ToolPort;
  readonly view: CustomViewPort;
  /** Project directory owning the stores the plugin reads. */
  readonly cwd: string;
}

/** Server-side ports, built from the server context; client-only seams die on use. */
const makeServerPorts = (context: PortsContext): Ports => ({
  agent: makeAgentPort(context),
  command: makeCommandPort(context),
  data: makeDataPort({}),
  grid: makeGridPagePort({}),
  interaction: makeInteractionPort({}),
  model: makeModelPort(context),
  session: makeSessionDispatchPort(context),
  skill: makeSkillPort(context),
  storage: makeStoragePort({}),
  tool: makeToolPort(context),
  view: makeCustomViewPort({}),
  cwd: context.location?.directory ?? process.cwd(),
});

/** Construct the seam ports over a server host context. */
export const makePorts = (context: PortsContext): Ports => makeServerPorts(context);

/**
 * Construct the seam ports over a TUI host context: the server seams stay
 * available (they die only if a TUI program calls one that needs the server
 * domain) and the client-local seams are wired to the live host objects.
 */
export const makeTuiPorts = (context: TuiPortsContext): Ports => ({
  ...makeServerPorts(context),
  data: makeDataPort(context),
  grid: makeGridPagePort(context),
  interaction: makeInteractionPort(context),
  storage: makeStoragePort(context),
  view: makeCustomViewPort(context),
});
