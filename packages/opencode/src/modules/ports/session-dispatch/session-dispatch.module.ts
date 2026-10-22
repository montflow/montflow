import type { Agent } from '@opencode/schema/agent';
import type { Location } from '@opencode/schema/location';
import type { Model } from '@opencode/schema/model';
import { AbsolutePath } from '@opencode/schema/schema';
import type { Session } from '@opencode/schema/session';
import type { SessionInbox } from '@opencode/schema/session-inbox';
import { Duration, Effect, Schema } from 'effect';

/** The transcript fields dispatch reads; every host message satisfies this shape. */
export interface SessionEntry {
  readonly type: string;
  readonly content?: ReadonlyArray<{
    readonly type: string;
    readonly text?: string;
  }>;
}

/**
 * The slice of the host server context `SessionDispatchPort` needs. The host
 * `SessionDomain` exposes no `parentID` on `create` (the public session API
 * creates a session at a location), so dispatch creates a native peer session
 * in the plugin's directory rather than a parent-linked child.
 */
export interface SessionDispatchContext {
  readonly location?: { readonly directory: string } | undefined;
  readonly session?:
    | {
        create(input: {
          readonly title?: string;
          readonly agent?: Agent.ID;
          readonly model?: Model.Ref;
          readonly location?: { readonly directory: Location.Ref['directory'] };
        }): Effect.Effect<{ readonly id: Session.ID }, unknown>;
        prompt(input: {
          readonly sessionID: Session.ID;
          readonly text: string;
          readonly delivery?: SessionInbox.Delivery;
        }): Effect.Effect<unknown, unknown>;
        interrupt(input: { readonly sessionID: Session.ID }): Effect.Effect<unknown, unknown>;
        wait(input: { readonly sessionID: Session.ID }): Effect.Effect<void, unknown>;
        synthetic(input: {
          readonly sessionID: Session.ID;
          readonly text: string;
          readonly description?: string;
        }): Effect.Effect<unknown, unknown>;
        context(input: {
          readonly sessionID: Session.ID;
        }): Effect.Effect<ReadonlyArray<SessionEntry>, unknown>;
      }
    | undefined;
}

/** Input for a native run: which agent/model to use and what to call it. */
export interface DispatchInput {
  readonly title?: string;
  readonly agent?: Agent.ID;
  readonly model?: Model.Ref;
}

/** Host create request, assembled field by field before dispatch. */
interface CreateRequest {
  title?: string;
  agent?: Agent.ID;
  model?: Model.Ref;
  location: { directory: AbsolutePath };
}

/** Host prompt request, assembled field by field before dispatch. */
interface PromptRequest {
  sessionID: Session.ID;
  text: string;
  delivery?: SessionInbox.Delivery;
}

/** Host synthetic note request, assembled field by field before dispatch. */
interface SyntheticRequest {
  sessionID: Session.ID;
  text: string;
  description?: string;
}

/** Host call a failed dispatch came from. */
export type DispatchOperation =
  | 'create'
  | 'prompt'
  | 'interrupt'
  | 'wait'
  | 'synthetic'
  | 'messages'
  | 'reply';

/** Failure raised when the host session domain rejects a dispatch call. */
export class DispatchError extends Schema.TaggedError<DispatchError>()('DispatchError', {
  operation: Schema.Literals([
    'create',
    'prompt',
    'interrupt',
    'wait',
    'synthetic',
    'messages',
    'reply',
  ]),
  message: Schema.String,
}) {}

/**
 * Native session dispatch seam. Creates a session, prompts it, waits for it
 * to settle, and reads its durable context. Message reads go through the
 * host `context` operation, which is the one server-side transcript surface
 * the plugin domain exposes.
 */
export interface SessionDispatchPort {
  readonly create: (input: DispatchInput) => Effect.Effect<Session.ID, DispatchError>;
  readonly prompt: (
    sessionID: Session.ID,
    text: string,
    delivery?: SessionInbox.Delivery,
  ) => Effect.Effect<void, DispatchError>;
  readonly interrupt: (sessionID: Session.ID) => Effect.Effect<void, DispatchError>;
  readonly wait: (sessionID: Session.ID) => Effect.Effect<void, DispatchError>;
  readonly synthetic: (
    sessionID: Session.ID,
    text: string,
    description?: string,
  ) => Effect.Effect<void, DispatchError>;
  readonly messages: (
    sessionID: Session.ID,
  ) => Effect.Effect<readonly SessionEntry[], DispatchError>;
  /** Last assistant text the session produced, or undefined when empty. */
  readonly reply: (sessionID: Session.ID) => Effect.Effect<string | undefined, DispatchError>;
}

const unavailable = (): Error =>
  new Error('SessionDispatchPort requires a server plugin context (ctx.session)');

/** How long one dispatched session may run before `wait` gives up. */
const WAIT_LIMIT = Duration.minutes(5);

/** Turn a host rejection into the port's tagged, actionable failure. */
const call = <A>(
  operation: DispatchOperation,
  // `cause` is the rule's exempt name for error-cause enrichment.
  run: Effect.Effect<A, unknown>,
): Effect.Effect<A, DispatchError> =>
  run.pipe(
    Effect.mapError(
      (cause) =>
        new DispatchError({
          operation,
          message: cause instanceof Error ? cause.message : String(cause),
        }),
    ),
  );

/** Fold an assistant message's text parts into one reply. */
const assistantText = (message: SessionEntry): string =>
  (message.content ?? [])
    .flatMap((part) => (part.type === 'text' && part.text !== undefined ? [part.text] : []))
    .join('\n')
    .trim();

/** Last non-empty assistant reply in a session's context. */
const lastReply = (messages: ReadonlyArray<SessionEntry>): string | undefined => {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message === undefined || message.type !== 'assistant') continue;
    const text = assistantText(message);
    if (text !== '') return text;
  }
  return undefined;
};

/** Build the native dispatch seam over the host session domain. */
export const makeSessionDispatchPort = (context: SessionDispatchContext): SessionDispatchPort => {
  const session = context.session;

  return {
    create: (input) => {
      if (session === undefined) return Effect.die(unavailable());
      const location = context.location;
      if (location === undefined) return Effect.die(unavailable());
      const request: CreateRequest = {
        location: { directory: AbsolutePath.make(location.directory) },
      };
      if (input.title !== undefined) request.title = input.title;
      if (input.agent !== undefined) request.agent = input.agent;
      if (input.model !== undefined) request.model = input.model;
      return call('create', session.create(request)).pipe(Effect.map((info) => info.id));
    },
    prompt: (sessionID, text, delivery) => {
      if (session === undefined) return Effect.die(unavailable());
      const request: PromptRequest = { sessionID, text };
      if (delivery !== undefined) request.delivery = delivery;
      return call('prompt', session.prompt(request)).pipe(Effect.asVoid);
    },
    interrupt: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return call('interrupt', session.interrupt({ sessionID })).pipe(Effect.asVoid);
    },
    wait: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return call('wait', session.wait({ sessionID })).pipe(
        Effect.timeoutOrElse({
          duration: WAIT_LIMIT,
          orElse: () =>
            Effect.fail(
              new DispatchError({
                operation: 'wait',
                message: `Session '${sessionID}' did not settle within five minutes. Interrupt it, or rerun the task with a narrower prompt.`,
              }),
            ),
        }),
      );
    },
    synthetic: (sessionID, text, description) => {
      if (session === undefined) return Effect.die(unavailable());
      const request: SyntheticRequest = { sessionID, text };
      if (description !== undefined) request.description = description;
      return call('synthetic', session.synthetic(request)).pipe(Effect.asVoid);
    },
    messages: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return call('messages', session.context({ sessionID }));
    },
    reply: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return call('reply', session.context({ sessionID })).pipe(Effect.map(lastReply));
    },
  };
};
