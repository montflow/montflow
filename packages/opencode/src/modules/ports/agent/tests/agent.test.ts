import { Effect, Scope } from 'effect';
import * as Vitest from '@effect/vitest';
import { Agent as AgentSchema } from '@opencode/schema/agent';
import * as AgentPort from '../index.js';

const base = (id: string): AgentSchema.Info => AgentSchema.Info.default(AgentSchema.ID.make(id));

/** One rebuild of the fake registry. */
interface Data {
  readonly agents: Map<string, AgentSchema.Info>;
  default: string | undefined;
}

/**
 * A replaying agent registry: each read rebuilds from the registered transforms
 * over the seeded base, exactly like the host `State`. A transform that disposes
 * itself therefore contributes nothing on the next read.
 */
const makeContext = (seeded: readonly AgentSchema.Info[] = []) => {
  const transforms: Array<(editor: AgentPort.AgentEditor) => void> = [];
  let state: Data = { agents: new Map(), default: undefined };
  let dirty = true;

  const reload = (): Data => {
    if (!dirty) return state;
    const next: Data = {
      agents: new Map(seeded.map((agent) => [agent.id, { ...agent }])),
      default: undefined,
    };
    const editor: AgentPort.AgentEditor = {
      list: () => [...next.agents.values()],
      get: (id) => next.agents.get(id),
      default: (id) => {
        next.default = id;
      },
      update: (id, update) => {
        const existing = next.agents.get(id) ?? base(id);
        if (!next.agents.has(id)) next.agents.set(id, existing);
        update(existing);
      },
      remove: (id) => {
        next.agents.delete(id);
      },
    };
    for (const transform of transforms) transform(editor);
    state = next;
    dirty = false;
    return state;
  };

  const context: AgentPort.AgentContext = {
    agent: {
      transform: (callback) =>
        Effect.gen(function* () {
          const scope = yield* Scope.Scope;
          transforms.push(callback);
          dirty = true;
          // Host `State.transform` rebuilds synchronously after registering.
          reload();
          const dispose = Effect.sync(() => {
            const index = transforms.indexOf(callback);
            if (index !== -1) transforms.splice(index, 1);
            dirty = true;
          });
          yield* Scope.addFinalizer(scope, dispose);
          return { dispose };
        }),
    },
  };

  return {
    context,
    reload: Effect.sync(() => {
      dirty = true;
    }),
    visible: reload,
  };
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

  Vitest.it.effect('an upsert outlives the call and survives a reload', () =>
    Effect.gen(function* () {
      const { context, reload, visible } = makeContext();
      const port = AgentPort.makeAgentPort(context);
      const agent = AgentPort.defineAgent({ id: 'mf-reviewer', name: 'Reviewer' });
      yield* Effect.gen(function* () {
        yield* port.upsert(agent);
        yield* reload;
        Vitest.expect(visible().agents.get('mf-reviewer')).toMatchObject({
          id: 'mf-reviewer',
          name: 'Reviewer',
        });
        Vitest.expect(yield* port.get('mf-reviewer')).toMatchObject({ name: 'Reviewer' });
      }).pipe(Effect.scoped);
      // The plugin scope closed, so every registration is gone with it.
      Vitest.expect(visible().agents.size).toBe(0);
    }),
  );

  Vitest.it.effect('list, default, and remove drive the registry until the scope closes', () =>
    Effect.gen(function* () {
      const existing = base('build');
      const { context, reload, visible } = makeContext([existing]);
      const port = AgentPort.makeAgentPort(context);
      yield* Effect.gen(function* () {
        Vitest.expect(yield* port.list()).toStrictEqual([existing]);
        yield* port.setDefault('build');
        yield* port.remove('build');
        yield* reload;
        Vitest.expect(visible().default).toBe('build');
        Vitest.expect(visible().agents.has('build')).toBe(false);
      }).pipe(Effect.scoped);
      Vitest.expect(visible().agents.has('build')).toBe(true);
      Vitest.expect(visible().default).toBeUndefined();
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
