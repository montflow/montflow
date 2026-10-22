import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import type { ModelPort, SessionDispatchPort } from '@montflow/opencode';

import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ReviewStore } from '../../../services/index.js';
import * as Dispatch from '../index.js';

const NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.provide(ReviewStore.Default, NodeLive);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-dispatch-'));

/** The model pin a dispatch request carries, taken from the port contract. */
type ModelPin = Parameters<SessionDispatchPort['create']>[0]['model'];

/** One dispatched session, as the fake dispatch port recorded it. */
interface Dispatched {
  readonly title: string | undefined;
  readonly model: ModelPin;
  readonly prompt: string;
}

/** Native session dispatch fake over an in-memory record. */
const makePorts = (dispatched: Array<Dispatched>, labels: Array<string> = []) => {
  const session: SessionDispatchPort = {
    create: (input) =>
      Effect.sync(() => {
        dispatched.push({ title: input.title, model: input.model, prompt: '' });
        // SAFETY: the fixture stands in for the host, which mints the session id.
        return `ses_${dispatched.length}` as never;
      }),
    prompt: (_sessionID, text) =>
      Effect.sync(() => {
        const last = dispatched[dispatched.length - 1];
        if (last !== undefined) dispatched[dispatched.length - 1] = { ...last, prompt: text };
      }),
    interrupt: () => Effect.void,
    wait: () => Effect.void,
    synthetic: () => Effect.void,
    messages: () => Effect.succeed([]),
    reply: () => Effect.succeed(undefined),
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
  return { session, model };
};

Vitest.describe('review dispatch', () => {
  Vitest.it('builds a prompt naming the series and its context', () => {
    const prompt = Dispatch.reviewerPrompt({
      root: '/repo',
      name: 'ship-spec-a',
      target: 'the phase',
      spec: 'ship-spec',
    });
    Vitest.expect(prompt).toContain("series 'ship-spec-a'");
    Vitest.expect(prompt).toContain('montflow-adversarial-review');
    Vitest.expect(prompt).toContain('- Spec: ship-spec');
    Vitest.expect(prompt).toContain('- Workspace root: /repo');
  });

  Vitest.it.effect('ensures the series, then dispatches a reviewer session', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dispatched: Array<Dispatched> = [];
      const labels: Array<string> = [];
      const ports = makePorts(dispatched, labels);
      const started = yield* Dispatch.startReview(ports, {
        root,
        name: 'demo',
        model: 'test/model',
      });
      Vitest.expect(started.series).toBe('demo');
      Vitest.expect(labels).toStrictEqual(['test/model']);
      Vitest.expect(dispatched).toHaveLength(1);
      const session = dispatched[0];
      Vitest.expect(session?.title).toBe('Review: demo');
      Vitest.expect(session?.prompt).toContain("series 'demo'");
      const ledger = yield* Effect.promise(() =>
        readFile(join(root, '.agents', '@montflow', 'reviews', 'demo', 'REVIEW.md'), 'utf8'),
      );
      Vitest.expect(ledger).toContain('# Review Series: demo');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('rejects an invalid series name before dispatching', () =>
    Effect.gen(function* () {
      const dispatched: Array<Dispatched> = [];
      const error = yield* Dispatch.startReview(makePorts(dispatched), {
        root: '/repo',
        name: 'Not A Slug',
      }).pipe(Effect.flip);
      Vitest.expect(error).toContain('not a valid series name');
      Vitest.expect(dispatched).toStrictEqual([]);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('reuses an existing series ledger and keeps dispatching', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dispatched: Array<Dispatched> = [];
      yield* Dispatch.startReview(makePorts(dispatched), { root, name: 'demo' });
      yield* Dispatch.startReview(makePorts(dispatched), { root, name: 'demo' });
      Vitest.expect(dispatched).toHaveLength(2);
      Vitest.expect(dispatched[1]?.title).toBe('Review: demo');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
