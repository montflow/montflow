import type { Agent } from '@opencode/schema/agent';
import type { Session } from '@opencode/schema/session';
import { Tool } from '@opencode/schema/tool';
import { Effect, type Schema, type Scope } from 'effect';

/** The slice of the host `ToolEditor` the port drives. */
export interface ToolEditor {
  list(): readonly (Tool.Info & { readonly id: string })[];
  add<Input extends Tool.ValueSchema<any>, Output extends Tool.ValueSchema<any> | undefined>(
    tool: Tool.Info<Input, Output>,
  ): void;
  update(id: string, update: (tool: Tool.Info) => void): void;
  remove(id: string): void;
}

/** The slice of the host server context `ToolPort` needs. */
export interface ToolContext {
  readonly tool?:
    | {
        readonly transform: (
          callback: (editor: ToolEditor) => void,
        ) => Effect.Effect<{ readonly dispose: Effect.Effect<void> }, never, Scope.Scope>;
        readonly list: () => Effect.Effect<
          readonly (Tool.Info & { readonly id: string })[],
          unknown
        >;
      }
    | undefined;
}

/** Agent-callable tool registration seam. */
export interface ToolPort {
  readonly add: <
    Input extends Tool.ValueSchema<any>,
    Output extends Tool.ValueSchema<any> | undefined,
  >(
    tool: Tool.Info<Input, Output>,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly update: (
    id: string,
    update: (tool: Tool.Info) => void,
  ) => Effect.Effect<void, never, Scope.Scope>;
  readonly remove: (id: string) => Effect.Effect<void, never, Scope.Scope>;
  readonly list: () => Effect.Effect<readonly (Tool.Info & { readonly id: string })[]>;
}

const unavailable = (): Error => new Error('ToolPort requires a server plugin context (ctx.tool)');

/** Host-free context a montflow tool sees when the host runs it. */
export interface ToolRunContext {
  readonly sessionID: Session.ID;
  readonly agentID: Agent.ID;
}

/**
 * Host-free tool descriptor. Concern packages build one of these and hand it
 * to `ToolPort.add` through {@link defineTool}, so they never import
 * `@opencode/*` themselves.
 */
export interface ToolDefinition<A> {
  readonly name: string;
  readonly description: string;
  readonly input: Schema.Codec<A, any>;
  /** Returns the text handed back to the model, or a displayable failure. */
  readonly execute: (input: A, context: ToolRunContext) => Effect.Effect<string, string>;
}

/** Adapt a host-free descriptor to the host `Tool.Info` contract. */
export const defineTool = <A>(
  definition: ToolDefinition<A>,
): Tool.Info<Schema.Codec<A, any>, undefined> => ({
  name: definition.name,
  description: definition.description,
  input: definition.input,
  execute: (input, context) =>
    definition.execute(input, { sessionID: context.sessionID, agentID: context.agent }).pipe(
      Effect.map((text) => ({ content: text })),
      Effect.mapError((message) => new Tool.Error({ message })),
    ),
});

/** Build the tool seam over the host tool domain. */
export const makeToolPort = (context: ToolContext): ToolPort => ({
  add: (tool) => {
    const domain = context.tool;
    if (domain === undefined) return Effect.die(unavailable());
    return Effect.asVoid(domain.transform((editor) => editor.add(tool)));
  },
  update: (id, update) => {
    const domain = context.tool;
    if (domain === undefined) return Effect.die(unavailable());
    return Effect.asVoid(domain.transform((editor) => editor.update(id, update)));
  },
  remove: (id) => {
    const domain = context.tool;
    if (domain === undefined) return Effect.die(unavailable());
    return Effect.asVoid(domain.transform((editor) => editor.remove(id)));
  },
  list: () => {
    const domain = context.tool;
    if (domain === undefined) return Effect.die(unavailable());
    return domain.list().pipe(Effect.orDie);
  },
});
