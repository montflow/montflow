import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import type { AgentPort, ModelPort, SessionDispatchPort } from '@montflow/opencode';
import type { Profile } from '../../../modules/profile/index.js';
import { runProfile } from '../index.js';

const profile = (overrides: Partial<Profile> = {}): Profile => ({
  name: 'reviewer',
  description: 'Reviews diffs',
  model: 'anthropic/claude-sonnet-4',
  skills: [],
  instructions: 'Be hostile.',
  checklist: [],
  ...overrides,
});

/** Fake seams that record the order of the calls a profile run makes. */
const makePorts = () => {
  const calls: string[] = [];
  const agent: AgentPort = {
    list: () => Effect.succeed([]),
    get: () => Effect.succeed(undefined),
    setDefault: () => Effect.void,
    upsert: (info) =>
      Effect.sync(() => {
        calls.push(`agent:${info.id}`);
      }),
    remove: () => Effect.void,
  };
  const model: ModelPort = {
    list: () => Effect.succeed([]),
    get: () => Effect.succeed(undefined),
    default: () => Effect.succeed(undefined),
    resolve: (label) =>
      Effect.sync(() => {
        // SAFETY: the fixture stands in for the host, which mints the branded ref.
        return label as never;
      }),
  };
  const session: SessionDispatchPort = {
    create: (input) =>
      Effect.sync(() => {
        calls.push(`create:${input.title ?? ''}`);
        // SAFETY: the fixture stands in for the host, which mints the session id.
        return 'ses_1' as never;
      }),
    prompt: () => Effect.void,
    wait: () => Effect.void,
    reply: () => Effect.succeed('done'),
  };
  return { ports: { agent, model, session }, calls };
};

Vitest.describe('profiles child run', () => {
  Vitest.it.effect('upserts the agent before creating the session', () =>
    Effect.gen(function* () {
      const { ports, calls } = makePorts();
      const scope = yield* Effect.scope;
      const reply = yield* runProfile(ports, profile(), 'review this', undefined, scope);
      Vitest.expect(reply).toBe('done');
      Vitest.expect(calls).toStrictEqual(['agent:mf-reviewer', 'create:profile: reviewer']);
    }),
  );

  Vitest.it.effect('rejects a profile without any model before touching the host', () =>
    Effect.gen(function* () {
      const { ports, calls } = makePorts();
      const scope = yield* Effect.scope;
      const error = yield* runProfile(ports, profile({ model: '' }), 'review this', '', scope).pipe(
        Effect.flip,
      );
      Vitest.expect(error).toContain('pins no model');
      Vitest.expect(calls).toStrictEqual([]);
    }),
  );
});
