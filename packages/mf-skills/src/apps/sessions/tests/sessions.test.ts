import type { ModelPort, SessionDispatchPort } from '@montflow/opencode';
import { Deferred, Effect, Fiber, Result, Schema, type Scope } from 'effect';
import * as Vitest from '@effect/vitest';
import { Interactive } from '../../index.js';
import * as Sessions from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

/** One dispatched session, as the fake dispatch port recorded it. */
interface Dispatched {
  readonly id: string;
  readonly title: string | undefined;
  readonly model: Parameters<SessionDispatchPort['create']>[0]['model'];
  prompt: string;
}

/** A skill in the memory store: the decoded row plus its raw `SKILL.md`. */
interface Entry {
  readonly skill: Skill.Skill;
  readonly raw: string;
}

const entry = (id: string, description = `the ${id} skill`): Entry => ({
  skill: Schema.decodeUnknownSync(Skill.Skill)({
    id,
    name: id,
    description,
    groups: [],
    dependencies: [],
    body: 'Body.',
  }),
  raw: `---\nname: ${id}\ndescription: ${description}\n---\n\nBody.\n`,
});

/** Memory skill store plus the writes the completion hooks made. */
interface MemoryStore {
  readonly store: Interactive.SkillStore;
  readonly entries: Map<string, Entry>;
  /** Skill ids the completion hooks re-encoded. */
  readonly saves: Array<string>;
  /** Mutate the store the way a session would. */
  readonly write: (id: string, description?: string) => void;
  readonly remove: (id: string) => void;
}

const memoryStore = (initial: ReadonlyArray<Entry>): MemoryStore => {
  const entries = new Map<string, Entry>(initial.map((item) => [item.skill.id, item]));
  const saves: Array<string> = [];
  return {
    entries,
    saves,
    write: (id, description) => {
      entries.set(id, entry(id, description));
    },
    remove: (id) => {
      entries.delete(id);
    },
    store: {
      list: () => Effect.succeed([...entries.values()].map((item) => item.skill)),
      save: (skill) =>
        Effect.sync(() => {
          saves.push(skill.id);
        }),
      delete: () => Effect.fail('unused'),
      readRaw: (id) => {
        const found = entries.get(id);
        return found === undefined
          ? Effect.fail(`Unknown skill '${id}'.`)
          : Effect.succeed(found.raw);
      },
    },
  };
};

/** Native session dispatch fake: one settle gate per dispatched session. */
const makeDispatch = () => {
  const dispatched: Array<Dispatched> = [];
  const labels: Array<string> = [];
  const gates = new Map<string, Deferred.Deferred<void>>();
  const replies = new Map<string, string | undefined>();

  const gate = (id: string): Deferred.Deferred<void> => {
    const existing = gates.get(id);
    if (existing !== undefined) return existing;
    const created = Deferred.makeUnsafe<void>();
    gates.set(id, created);
    return created;
  };

  const find = (id: string): Dispatched | undefined =>
    dispatched.find((session) => session.id === id);

  const session: SessionDispatchPort = {
    create: (input) =>
      Effect.sync(() => {
        const id = `ses_${dispatched.length + 1}`;
        const record: Dispatched = { id, title: input.title, model: input.model, prompt: '' };
        dispatched.push(record);
        // SAFETY: the fixture stands in for the host, which mints the session id.
        return id as never;
      }),
    prompt: (sessionID, text) =>
      Effect.sync(() => {
        const record = find(sessionID);
        if (record !== undefined) record.prompt = text;
      }),
    wait: (sessionID) => Deferred.await(gate(sessionID)),
    reply: (sessionID) => Effect.succeed(replies.get(sessionID)),
  };

  const model: ModelPort = {
    list: () => Effect.succeed([]),
    get: () => Effect.succeed(undefined),
    default: () => Effect.succeed(undefined),
    resolve: (label) =>
      Effect.sync(() => {
        labels.push(label);
        // SAFETY: the fixture only records the label; a branded `Model.Ref` is
        // the port's return contract, and dispatch only passes it through.
        return label as never;
      }),
  };

  return { session, model, dispatched, labels, replies, gate };
};

type Fake = ReturnType<typeof makeDispatch>;

/** Ports over a memory store and the fake dispatch, plus the recorders. */
const harness = (initial: ReadonlyArray<Entry>, scope: Scope.Scope) => {
  const dispatch = makeDispatch();
  const messages: Array<string> = [];
  const store = memoryStore(initial);
  const ports = Sessions.makeSkillSessionPorts(
    { session: dispatch.session, model: dispatch.model },
    { storeFor: () => store.store, scope },
  );
  const notify = (message: string): void => {
    messages.push(message);
  };
  return { dispatch, messages, store, ports, notify };
};

/** Settle a dispatched session with the given final assistant text. */
const settle = (fake: Fake, id: string, reply: string | undefined): Effect.Effect<void> =>
  Effect.gen(function* () {
    if (reply !== undefined) fake.replies.set(id, reply);
    yield* Deferred.succeed(fake.gate(id), undefined);
    // Let the forked settle watcher read the reply and run the completion hook.
    yield* Effect.yieldNow;
    yield* Effect.yieldNow;
  });

/**
 * Run a dispatching port and hand back the failure it unwound with. A
 * port that wrongly resolved a skill comes back as a marker, so the
 * assertion below fails with something readable.
 * @param effect - the port's Effect
 * @returns Effect resolving to the failure value
 */
const failureOf = (effect: Effect.Effect<Skill.Skill, string>): Effect.Effect<string> =>
  Effect.result(effect).pipe(
    Effect.map((result) =>
      Result.isFailure(result) ? result.failure : `<resolved ${result.success.id}>`,
    ),
  );

/** The only session the harness dispatched, failing the test when absent. */
const only = (fake: Fake): Effect.Effect<Dispatched, string> => {
  const session = fake.dispatched[0];
  return session === undefined ? Effect.fail('no session dispatched') : Effect.succeed(session);
};

Vitest.describe('Sessions.pickAuthoredSkill', () => {
  Vitest.it('prefers the skill the session named in its reply', () => {
    const pick = Sessions.pickAuthoredSkill('Created beta.', [
      entry('alpha').skill,
      entry('beta').skill,
    ]);
    Vitest.expect(pick).toStrictEqual({ kind: 'one', id: 'beta' });
  });

  Vitest.it('falls back to the diff only when it is unambiguous', () => {
    Vitest.expect(Sessions.pickAuthoredSkill(undefined, [entry('alpha').skill])).toStrictEqual({
      kind: 'one',
      id: 'alpha',
    });
  });

  Vitest.it('reports several fresh skills as ambiguous', () => {
    const pick = Sessions.pickAuthoredSkill(undefined, [entry('alpha').skill, entry('beta').skill]);
    Vitest.expect(pick).toStrictEqual({ kind: 'ambiguous', ids: ['alpha', 'beta'] });
  });

  Vitest.it('reports nothing written', () => {
    Vitest.expect(Sessions.pickAuthoredSkill('nothing', [])).toStrictEqual({ kind: 'none' });
  });
});

Vitest.describe('Sessions generator dispatch', () => {
  Vitest.it.effect('dispatches an author session, names it, and unwinds the flow', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, ports, notify } = harness([], scope);
      const failure = yield* failureOf(
        ports.generateFor(
          '/repo',
          notify,
        )({
          description: 'a TypeScript reviewer skill',
          modelLabel: 'test/model',
          inject: [],
        }),
      );
      Vitest.expect(failure).toBe(Interactive.DISPATCHED);
      const session = yield* only(dispatch);
      Vitest.expect(session.title).toBe('Create skill: a TypeScript reviewer skill');
      Vitest.expect(session.prompt).toContain('You are a skill author');
      Vitest.expect(session.prompt).toContain('Skill description: a TypeScript reviewer skill');
      Vitest.expect(dispatch.labels).toStrictEqual(['test/model']);
      Vitest.expect(session.model).toBeDefined();
      Vitest.expect(messages[0]).toContain(session.id);
    }),
  );

  Vitest.it.effect('re-encodes and reports the skill the session created', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, store, ports, notify } = harness([], scope);
      yield* failureOf(
        ports.generateFor('/repo', notify)({ description: 'x', modelLabel: undefined, inject: [] }),
      );
      const session = yield* only(dispatch);
      store.write('reviewer', 'reviews TypeScript');
      yield* settle(dispatch, session.id, 'Created reviewer.');
      Vitest.expect(store.saves).toStrictEqual(['reviewer']);
      Vitest.expect(messages[1]).toBe("Created skill 'reviewer'.");
    }),
  );

  Vitest.it.effect('settles after the dispatching fiber ends', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, store, ports, notify } = harness([], scope);
      // The tool-execute fiber: it ends as soon as the dispatch returns.
      const dispatching = yield* Effect.forkChild(
        failureOf(
          ports.generateFor(
            '/repo',
            notify,
          )({
            description: 'x',
            modelLabel: undefined,
            inject: [],
          }),
        ),
      );
      Vitest.expect(yield* Fiber.join(dispatching)).toBe(Interactive.DISPATCHED);
      const session = yield* only(dispatch);
      store.write('reviewer', 'reviews TypeScript');
      yield* settle(dispatch, session.id, 'Created reviewer.');
      Vitest.expect(store.saves).toStrictEqual(['reviewer']);
      Vitest.expect(messages[1]).toBe("Created skill 'reviewer'.");
    }),
  );

  Vitest.it.effect('reports a settle that created nothing', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, ports, notify } = harness([], scope);
      yield* failureOf(
        ports.generateFor('/repo', notify)({ description: 'x', modelLabel: undefined, inject: [] }),
      );
      const session = yield* only(dispatch);
      yield* settle(dispatch, session.id, 'I could not do it.');
      Vitest.expect(messages[1]).toContain('without creating a skill');
    }),
  );
});

Vitest.describe('Sessions modifier dispatch', () => {
  Vitest.it.effect('dispatches an editor session scoped to the skill and unwinds', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, ports, notify } = harness([entry('reviewer')], scope);
      const failure = yield* failureOf(
        ports.modifyFor(
          '/repo',
          notify,
        )({
          skill: entry('reviewer').skill,
          instruction: 'add a checklist item',
          modelLabel: undefined,
          inject: [],
        }),
      );
      Vitest.expect(failure).toBe(Interactive.DISPATCHED);
      const session = yield* only(dispatch);
      Vitest.expect(session.title).toBe('Modify skill: reviewer');
      Vitest.expect(session.prompt).toContain('Skill to edit: reviewer');
      Vitest.expect(session.prompt).toContain('Change request: add a checklist item');
      Vitest.expect(dispatch.labels).toStrictEqual([]);
      Vitest.expect(messages[0]).toContain(session.id);
    }),
  );

  Vitest.it.effect('re-encodes and reports the updated skill on settle', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, store, ports, notify } = harness([entry('reviewer')], scope);
      yield* failureOf(
        ports.modifyFor(
          '/repo',
          notify,
        )({
          skill: entry('reviewer').skill,
          instruction: 'add a checklist item',
          modelLabel: 'test/model',
          inject: [],
        }),
      );
      const session = yield* only(dispatch);
      store.write('reviewer', 'reviews TypeScript and tests');
      yield* settle(dispatch, session.id, 'Updated.');
      Vitest.expect(dispatch.labels).toStrictEqual(['test/model']);
      Vitest.expect(store.saves).toStrictEqual(['reviewer']);
      Vitest.expect(messages[1]).toBe("Updated skill 'reviewer'.");
    }),
  );

  Vitest.it.effect('reports a settle that left the skill untouched', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, ports, notify } = harness([entry('reviewer')], scope);
      yield* failureOf(
        ports.modifyFor(
          '/repo',
          notify,
        )({
          skill: entry('reviewer').skill,
          instruction: 'x',
          modelLabel: undefined,
          inject: [],
        }),
      );
      const session = yield* only(dispatch);
      yield* settle(dispatch, session.id, 'done');
      Vitest.expect(messages[1]).toContain('without updating');
    }),
  );

  Vitest.it.effect('reports a session that never settles and skips its completion', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, store, ports, notify } = harness([entry('reviewer')], scope);
      yield* failureOf(
        ports.modifyFor(
          '/repo',
          notify,
        )({
          skill: entry('reviewer').skill,
          instruction: 'x',
          modelLabel: undefined,
          inject: [],
        }),
      );
      const session = yield* only(dispatch);
      store.write('reviewer', 'reviews TypeScript and tests');
      yield* Deferred.interrupt(dispatch.gate(session.id));
      yield* Effect.yieldNow;
      yield* Effect.yieldNow;
      Vitest.expect(store.saves).toStrictEqual([]);
      Vitest.expect(messages[1]).toContain('ended before it could be verified');
    }),
  );

  Vitest.it.effect('reports a settle that removed the skill file', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, messages, store, ports, notify } = harness([entry('reviewer')], scope);
      yield* failureOf(
        ports.modifyFor(
          '/repo',
          notify,
        )({
          skill: entry('reviewer').skill,
          instruction: 'x',
          modelLabel: undefined,
          inject: [],
        }),
      );
      const session = yield* only(dispatch);
      store.remove('reviewer');
      yield* settle(dispatch, session.id, 'done');
      Vitest.expect(messages[1]).toContain('without updating');
    }),
  );
});

Vitest.describe('Sessions transform dispatch', () => {
  Vitest.it.effect('dispatches a transform session with its own prompt and title', () =>
    Effect.gen(function* () {
      const scope = yield* Effect.scope;
      const { dispatch, ports, notify } = harness([entry('reviewer')], scope);
      yield* failureOf(
        ports.transformFor(
          '/repo',
          notify,
        )({
          skill: entry('reviewer').skill,
          instruction: 'standard format',
          modelLabel: undefined,
          inject: [],
        }),
      );
      const session = yield* only(dispatch);
      Vitest.expect(session.title).toBe('Transform skill: reviewer');
      Vitest.expect(session.prompt).toContain('Skill to fix: reviewer');
    }),
  );
});
