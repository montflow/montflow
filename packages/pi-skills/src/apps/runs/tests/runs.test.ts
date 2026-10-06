import { Effect, Layer, Result, Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import { Run, Runner, type RunnerImpl, type RunDetail } from '@montflow/pi-runs';
import { Interactive } from '../../index.js';
import * as Runs from '../index.js';
import * as Skill from '../../../modules/skill/index.js';

/** One dispatched run, as the fake engine recorded it. */
interface Started {
  readonly id: string;
  readonly prompt: string;
  readonly onSettled: ((detail: RunDetail) => Effect.Effect<void>) | undefined;
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
  /** Mutate the store the way a run would. */
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

/** Fake engine layer: records dispatches, never opens a Pi session. */
const fakeRunner = (started: Array<Started>): Layer.Layer<Runner> => {
  const impl: RunnerImpl = {
    start: (input) =>
      Effect.sync(() => {
        started.push({ id: input.id, prompt: input.prompt, onSettled: input.onSettled });
        return Schema.decodeUnknownSync(Run.Run)({
          id: input.id,
          parent: null,
          status: 'running',
          created: '2026-09-05T00:00:00Z',
          updated: '2026-09-05T00:00:00Z',
          sessionFile: `.agents/@montflow/runs/${input.id}/session.jsonl`,
        });
      }),
    resume: () => Effect.fail('unused'),
    steer: () => Effect.fail('unused'),
    answer: () => Effect.fail('unused'),
    interrupt: () => Effect.fail('unused'),
    detail: () => Effect.fail('unused'),
    verify: () => Effect.fail('unused'),
    verifyStore: () => Effect.fail('unused'),
    progress: () => Effect.fail('unused'),
    list: () => Effect.succeed([]),
    liveRunIds: () => Effect.succeed(new Set()),
  };
  return Layer.succeed(Runner, impl);
};

/** Ports over a memory store and the fake engine, plus the recorders. */
const harness = (initial: ReadonlyArray<Entry>) => {
  const started: Array<Started> = [];
  const messages: Array<string> = [];
  const store = memoryStore(initial);
  const ports = Runs.makeSkillRunPorts({
    storeFor: () => store.store,
    layerFor: () => fakeRunner(started),
  });
  const notify = (message: string): void => {
    messages.push(message);
  };
  return { started, messages, store, ports, notify };
};

/** Settle a recorded run with the given final assistant text. */ const settle = (
  run: Started,
  reply: string,
): Effect.Effect<void> => {
  const detail = {
    run: Schema.decodeUnknownSync(Run.Run)({
      id: run.id,
      parent: null,
      status: 'done',
      created: '2026-09-05T00:00:00Z',
      updated: '2026-09-05T00:00:00Z',
      sessionFile: `.agents/@montflow/runs/${run.id}/session.jsonl`,
    }),
    events: [{ seq: 1, role: 'assistant', text: reply, at: '2026-09-05T00:00:00Z' }],
    receipt: { outcome: 'done', summary: reply },
  } satisfies RunDetail;
  return run.onSettled?.(detail) ?? Effect.void;
};

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

Vitest.describe('Runs.pickAuthoredSkill', () => {
  Vitest.it('prefers the skill the run named in its reply', () => {
    const pick = Runs.pickAuthoredSkill('Created beta.', [
      entry('alpha').skill,
      entry('beta').skill,
    ]);
    Vitest.expect(pick).toStrictEqual({ kind: 'one', id: 'beta' });
  });

  Vitest.it('falls back to the diff only when it is unambiguous', () => {
    Vitest.expect(Runs.pickAuthoredSkill(undefined, [entry('alpha').skill])).toStrictEqual({
      kind: 'one',
      id: 'alpha',
    });
  });

  Vitest.it('reports several fresh skills as ambiguous', () => {
    const pick = Runs.pickAuthoredSkill(undefined, [entry('alpha').skill, entry('beta').skill]);
    Vitest.expect(pick).toStrictEqual({ kind: 'ambiguous', ids: ['alpha', 'beta'] });
  });

  Vitest.it('reports nothing written', () => {
    Vitest.expect(Runs.pickAuthoredSkill('nothing', [])).toStrictEqual({ kind: 'none' });
  });
});

Vitest.describe('Runs generator dispatch', () => {
  Vitest.it.effect('dispatches an author run, names it, and unwinds the flow', () =>
    Effect.gen(function* () {
      const { started, messages, ports, notify } = harness([]);
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
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      Vitest.expect(run.id.startsWith('create-skill-')).toBe(true);
      Vitest.expect(run.prompt).toContain('You are a skill author');
      Vitest.expect(run.prompt).toContain('Skill description: a TypeScript reviewer skill');
      Vitest.expect(messages[0]).toContain(run.id);
    }),
  );

  Vitest.it.effect('re-encodes and reports the skill the run created', () =>
    Effect.gen(function* () {
      const { started, messages, store, ports, notify } = harness([]);
      yield* failureOf(
        ports.generateFor('/repo', notify)({ description: 'x', modelLabel: undefined, inject: [] }),
      );
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      store.write('reviewer', 'reviews TypeScript');
      yield* settle(run, 'Created reviewer.');
      Vitest.expect(store.saves).toStrictEqual(['reviewer']);
      Vitest.expect(messages[1]).toBe("Created skill 'reviewer'.");
    }),
  );

  Vitest.it.effect('reports a settle that created nothing', () =>
    Effect.gen(function* () {
      const { started, messages, ports, notify } = harness([]);
      yield* failureOf(
        ports.generateFor('/repo', notify)({ description: 'x', modelLabel: undefined, inject: [] }),
      );
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      yield* settle(run, 'I could not do it.');
      Vitest.expect(messages[1]).toContain('without creating a skill');
    }),
  );
});

Vitest.describe('Runs modifier dispatch', () => {
  Vitest.it.effect('dispatches an editor run scoped to the skill and unwinds', () =>
    Effect.gen(function* () {
      const { started, messages, ports, notify } = harness([entry('reviewer')]);
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
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      Vitest.expect(run.id.startsWith('modify-skill-')).toBe(true);
      Vitest.expect(run.prompt).toContain('Skill to edit: reviewer');
      Vitest.expect(run.prompt).toContain('Change request: add a checklist item');
      Vitest.expect(messages[0]).toContain(run.id);
    }),
  );

  Vitest.it.effect('re-encodes and reports the updated skill on settle', () =>
    Effect.gen(function* () {
      const { started, messages, store, ports, notify } = harness([entry('reviewer')]);
      yield* failureOf(
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
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      store.write('reviewer', 'reviews TypeScript and tests');
      yield* settle(run, 'Updated.');
      Vitest.expect(store.saves).toStrictEqual(['reviewer']);
      Vitest.expect(messages[1]).toBe("Updated skill 'reviewer'.");
    }),
  );

  Vitest.it.effect('reports a settle that left the skill untouched', () =>
    Effect.gen(function* () {
      const { started, messages, ports, notify } = harness([entry('reviewer')]);
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
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      yield* settle(run, 'done');
      Vitest.expect(messages[1]).toContain('without updating');
    }),
  );

  Vitest.it.effect('reports a settle that removed the skill file', () =>
    Effect.gen(function* () {
      const { started, messages, store, ports, notify } = harness([entry('reviewer')]);
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
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      store.remove('reviewer');
      yield* settle(run, 'done');
      Vitest.expect(messages[1]).toContain('without updating');
    }),
  );
});

Vitest.describe('Runs transform dispatch', () => {
  Vitest.it.effect('dispatches a transform run with its own prompt and id prefix', () =>
    Effect.gen(function* () {
      const { started, ports, notify } = harness([entry('reviewer')]);
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
      const run = started[0];
      if (run === undefined) return yield* Effect.fail('no run dispatched');
      Vitest.expect(run.id.startsWith('transform-skill-')).toBe(true);
      Vitest.expect(run.prompt).toContain('Skill to fix: reviewer');
    }),
  );
});
