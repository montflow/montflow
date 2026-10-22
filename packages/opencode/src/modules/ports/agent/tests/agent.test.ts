import { Effect } from 'effect';
import * as Vitest from '@effect/vitest';
import { Agent as AgentSchema } from '@opencode/schema/agent';
import * as AgentPort from '../index.js';

const base = (id: string): AgentSchema.Info => AgentSchema.Info.default(AgentSchema.ID.make(id));

interface Calls {
  readonly updates: Array<string>;
  readonly defaults: Array<string | undefined>;
  readonly removed: Array<string>;
}

const makeContext = (registered: Array<AgentSchema.Info> = []) => {
  const calls: Calls = { updates: [], defaults: [], removed: [] };
  const context: AgentPort.AgentContext = {
    agent: {
      transform: (callback) =>
        Effect.sync(() => {
          callback({
            list: () => registered,
            get: (id) => registered.find((agent) => agent.id === id),
            default: (id) => {
              calls.defaults.push(id);
            },
            update: (id, update) => {
              calls.updates.push(id);
              const existing = registered.find((agent) => agent.id === id);
              if (existing === undefined) {
                const created = base(id);
                update(created);
                registered.push(created);
              } else {
                update(existing);
              }
            },
            remove: (id) => {
              calls.removed.push(id);
            },
          });
          return { dispose: Effect.void };
        }),
    },
  };
  return { context, calls };
};

Vitest.describe('AgentPort runtime', () => {
  Vitest.it('defineAgent builds a host agent from a profile descriptor', () => {
    const agent = AgentPort.defineAgent({
      id: 'mf-reviewer',
      name: 'Reviewer',
      description: 'Reviews diffs',
      system: 'Be hostile.',
      model: 'anthropic/claude-sonnet-4',
    });
    Vitest.expect(agent.id).toBe('mf-reviewer');
    Vitest.expect(agent.name).toBe('Reviewer');
    Vitest.expect(agent.description).toBe('Reviews diffs');
    Vitest.expect(agent.system).toBe('Be hostile.');
    Vitest.expect(agent.model).toStrictEqual({
      providerID: 'anthropic',
      id: 'claude-sonnet-4',
    });
    Vitest.expect(agent.mode).toBe('subagent');
    Vitest.expect(agent.hidden).toBe(false);
  });

  Vitest.it('defineAgent keeps a profile without a model model-agnostic', () => {
    const agent = AgentPort.defineAgent({ id: 'mf-reviewer', name: 'Reviewer', model: '  ' });
    Vitest.expect(agent.model).toBeUndefined();
  });

  Vitest.it('defineAgent rejects an unparseable model label', () => {
    Vitest.expect(() =>
      AgentPort.defineAgent({ id: 'mf-reviewer', name: 'Reviewer', model: 'not-a-model' }),
    ).toThrow();
  });

  Vitest.it.effect('upsert creates the agent through the host editor', () =>
    Effect.gen(function* () {
      const { context, calls } = makeContext();
      const port = AgentPort.makeAgentPort(context);
      const agent = AgentPort.defineAgent({ id: 'mf-reviewer', name: 'Reviewer' });
      yield* port.upsert(agent).pipe(Effect.scoped);
      Vitest.expect(calls.updates).toStrictEqual(['mf-reviewer']);
      Vitest.expect(yield* port.get('mf-reviewer')).toMatchObject({
        id: 'mf-reviewer',
        name: 'Reviewer',
      });
    }),
  );

  Vitest.it.effect('list, default, and remove read and drive the registry', () =>
    Effect.gen(function* () {
      const existing = base('build');
      const { context, calls } = makeContext([existing]);
      const port = AgentPort.makeAgentPort(context);
      Vitest.expect(yield* port.list()).toStrictEqual([existing]);
      yield* port.setDefault('build').pipe(Effect.scoped);
      yield* port.remove('build').pipe(Effect.scoped);
      Vitest.expect(calls.defaults).toStrictEqual(['build']);
      Vitest.expect(calls.removed).toStrictEqual(['build']);
    }),
  );

  Vitest.it.effect('fails at call time without a server context', () =>
    Effect.gen(function* () {
      const port = AgentPort.makeAgentPort({});
      const error = yield* port.list().pipe(
        Effect.catchDefect((defect) => Effect.fail(defect)),
        Effect.flip,
      );
      Vitest.expect(error).toBeInstanceOf(Error);
    }),
  );
});
