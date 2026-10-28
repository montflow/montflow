import { describe, expect, it } from 'vitest';
import { Effect } from 'effect';
import type { CommandInvocation } from '@opencode/plugin/effect/command';
import type { SessionDispatchPort } from '../../ports/session-dispatch/index.js';
import { makeCommandReply } from '../command-reply.module.js';

// SAFETY: the reply channel never inspects the branded session id or delivery
// value; it forwards them to the fake session verbatim.
const sessionID: CommandInvocation['sessionID'] = 'ses_test' as CommandInvocation['sessionID'];
// SAFETY: same boundary — any delivery value is forwarded untouched.
const delivery: CommandInvocation['delivery'] = 'queue' as CommandInvocation['delivery'];

// SAFETY: the fake session reads only `sessionID`, `delivery`, and `prompt.text`.
const INVOCATION = { sessionID, delivery, prompt: { text: 'list' } } as CommandInvocation;

/** Session seam that records prompts and optionally fails them. */
const makeSession = (options: { readonly fail?: boolean } = {}) => {
  const messages: Array<{ readonly sessionID: string; readonly text: string }> = [];
  // SAFETY: the fake implements the port surface the reply channel reads.
  const session = {
    create: () => Effect.die('unused'),
    prompt: (id: string, text: string) => {
      if (options.fail === true) return Effect.die('session gone');
      messages.push({ sessionID: id, text });
      return Effect.void;
    },
    wait: () => Effect.void,
    context: () => Effect.succeed([]),
    reply: () => Effect.succeed(undefined),
  } as SessionDispatchPort;
  return { session, messages };
};

describe('makeCommandReply', () => {
  it('posts queued lines in order into the invoking session', async () => {
    const host = makeSession();
    const reply = makeCommandReply(host.session, INVOCATION);

    reply.notify('first');
    reply.notify('second', 'error');
    await reply.flush().pipe(Effect.runPromise);

    expect(host.messages).toStrictEqual([
      { sessionID, text: 'first' },
      { sessionID, text: 'second' },
    ]);
  });

  it('flushes once: a second call posts nothing', async () => {
    const host = makeSession();
    const reply = makeCommandReply(host.session, INVOCATION);

    reply.notify('only');
    await reply.flush().pipe(Effect.runPromise);
    await reply.flush().pipe(Effect.runPromise);

    expect(host.messages).toHaveLength(1);
  });

  it('survives a failed post and keeps the remaining lines', async () => {
    const host = makeSession({ fail: true });
    const reply = makeCommandReply(host.session, INVOCATION);

    reply.notify('lost');
    await expect(reply.flush().pipe(Effect.runPromise)).resolves.toBeUndefined();

    expect(host.messages).toStrictEqual([]);
  });
});
