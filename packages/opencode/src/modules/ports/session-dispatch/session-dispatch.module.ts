import type { Agent } from '@opencode/schema/agent';
import type { Location } from '@opencode/schema/location';
import type { Model } from '@opencode/schema/model';
import { AbsolutePath } from '@opencode/schema/schema';
import type { Session } from '@opencode/schema/session';
import type { SessionInbox } from '@opencode/schema/session-inbox';
import { Effect } from 'effect';

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

/**
 * Native session dispatch seam. Creates a session, prompts it, waits for it
 * to settle, and reads its durable context. Message reads go through the
 * host `context` operation, which is the one server-side transcript surface
 * the plugin domain exposes.
 */
export interface SessionDispatchPort {
  readonly create: (input: DispatchInput) => Effect.Effect<Session.ID>;
  readonly prompt: (
    sessionID: Session.ID,
    text: string,
    delivery?: SessionInbox.Delivery,
  ) => Effect.Effect<void>;
  readonly interrupt: (sessionID: Session.ID) => Effect.Effect<void>;
  readonly wait: (sessionID: Session.ID) => Effect.Effect<void>;
  readonly synthetic: (
    sessionID: Session.ID,
    text: string,
    description?: string,
  ) => Effect.Effect<void>;
  readonly messages: (sessionID: Session.ID) => Effect.Effect<readonly SessionEntry[]>;
  /** Last assistant text the session produced, or undefined when empty. */
  readonly reply: (sessionID: Session.ID) => Effect.Effect<string | undefined>;
}

const unavailable = (): Error =>
  new Error('SessionDispatchPort requires a server plugin context (ctx.session)');

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
      return session.create(request).pipe(
        Effect.orDie,
        Effect.map((info) => info.id),
      );
    },
    prompt: (sessionID, text, delivery) => {
      if (session === undefined) return Effect.die(unavailable());
      const request: PromptRequest = { sessionID, text };
      if (delivery !== undefined) request.delivery = delivery;
      return session.prompt(request).pipe(Effect.orDie, Effect.asVoid);
    },
    interrupt: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return session.interrupt({ sessionID }).pipe(Effect.orDie, Effect.asVoid);
    },
    wait: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return session.wait({ sessionID }).pipe(Effect.orDie);
    },
    synthetic: (sessionID, text, description) => {
      if (session === undefined) return Effect.die(unavailable());
      const request: SyntheticRequest = { sessionID, text };
      if (description !== undefined) request.description = description;
      return session.synthetic(request).pipe(Effect.orDie, Effect.asVoid);
    },
    messages: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return session.context({ sessionID }).pipe(Effect.orDie);
    },
    reply: (sessionID) => {
      if (session === undefined) return Effect.die(unavailable());
      return session.context({ sessionID }).pipe(Effect.orDie, Effect.map(lastReply));
    },
  };
};
