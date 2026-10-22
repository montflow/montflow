import type { Agent } from '@opencode/schema/agent';
import { Agent as AgentSchema } from '@opencode/schema/agent';
import { Model as ModelSchema } from '@opencode/schema/model';
import { Effect, type Scope } from 'effect';

/** The slice of the host `AgentEditor` the port drives. */
export interface AgentEditor {
  list(): readonly Agent.Info[];
  get(id: string): Agent.Info | undefined;
  default(id: string | undefined): void;
  update(id: string, update: (agent: Agent.Info) => void): void;
  remove(id: string): void;
}

/** The slice of the host server context `AgentPort` needs. */
export interface AgentContext {
  readonly agent?:
    | {
        readonly transform: (
          callback: (editor: AgentEditor) => void,
        ) => Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never, Scope.Scope>;
      }
    | undefined;
}

/**
 * Agent registry seam. `upsert` relies on the host editor creating a missing
 * agent when `update` is called with an unknown id, so profiles become
 * native selectable agents without a montflow-owned registry.
 */
export interface AgentPort {
  readonly list: () => Effect.Effect<readonly Agent.Info[]>;
  readonly get: (id: string) => Effect.Effect<Agent.Info | undefined>;
  /** Registers a default-agent transform owned by the calling plugin scope. */
  readonly setDefault: (id: string | undefined) => Effect.Effect<void, never, Scope.Scope>;
  /** Registers an upsert transform owned by the calling plugin scope. */
  readonly upsert: (agent: Agent.Info) => Effect.Effect<void, never, Scope.Scope>;
  /** Registers a removal transform owned by the calling plugin scope. */
  readonly remove: (id: string) => Effect.Effect<void, never, Scope.Scope>;
}

const unavailable = (): Error =>
  new Error('AgentPort requires a server plugin context (ctx.agent)');

/** Host-free descriptor for a profile-backed agent. */
export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  /** Markdown instructions shown to the agent as its system prompt. */
  readonly system?: string;
  /** `provider/model-id`, when the profile pins one. */
  readonly model?: string;
  readonly mode?: Agent.Info['mode'];
  readonly hidden?: boolean;
}

/** Agent record with the readonly host fields opened for incremental filling. */
type MutableAgent = { -readonly [K in keyof Agent.Info]: Agent.Info[K] };

/**
 * Build a host `Agent.Info` from a plain descriptor. Missing optional fields
 * keep the host defaults, so a profile without a model stays model-agnostic.
 */
export const defineAgent = (definition: AgentDefinition): Agent.Info => {
  const base = AgentSchema.Info.default(AgentSchema.ID.make(definition.id));
  const agent: MutableAgent = {
    ...base,
    name: AgentSchema.Name.make(definition.name),
    mode: definition.mode ?? 'subagent',
    hidden: definition.hidden ?? false,
  };
  if (definition.description !== undefined) agent.description = definition.description;
  if (definition.system !== undefined) agent.system = definition.system;
  const model = definition.model?.trim() ?? '';
  if (model !== '') agent.model = ModelSchema.Ref.parse(model);
  return agent;
};

/** Run a callback over the host agent editor inside a closed scope. */
const read = <A>(context: AgentContext, select: (editor: AgentEditor) => A): Effect.Effect<A> => {
  const domain = context.agent;
  if (domain === undefined) return Effect.die(unavailable());
  return Effect.gen(function* () {
    let value: A | undefined;
    const registration = yield* domain.transform((editor) => {
      value = select(editor);
    });
    yield* registration.dispose;
    // SAFETY: `transform` runs the callback synchronously, so `select` assigns
    // before the scope closes; a host contract change dies here, not silently.
    return value as A;
  }).pipe(Effect.scoped);
};

/**
 * Register a mutation with the host transform. The host rebuilds state from
 * every live transform on each read, so disposing here would discard the
 * mutation; the registration lives for the caller's plugin scope instead.
 */
const write = (
  context: AgentContext,
  apply: (editor: AgentEditor) => void,
): Effect.Effect<void, never, Scope.Scope> => {
  const domain = context.agent;
  if (domain === undefined) return Effect.die(unavailable());
  return Effect.asVoid(domain.transform(apply));
};

/** Build the agent seam over the host agent domain. */
export const makeAgentPort = (context: AgentContext): AgentPort => ({
  list: () => read(context, (editor) => editor.list()),
  get: (id) => read(context, (editor) => editor.get(id)),
  setDefault: (id) => write(context, (editor) => editor.default(id)),
  upsert: (agent) =>
    write(context, (editor) =>
      editor.update(agent.id, (existing) => {
        Object.assign(existing, agent);
      }),
    ),
  remove: (id) => write(context, (editor) => editor.remove(id)),
});
