import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import type { ModelPort, SessionDispatchPort } from '@montflow/opencode';
import { ProfileStore } from '@montflow/profiles';

import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ReviewStore } from '../../../services/index.js';
import * as Dispatch from '../index.js';

const NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.merge(
  Layer.provide(ReviewStore.Default, NodeLive),
  Layer.provide(ProfileStore.Default, NodeLive),
);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-dispatch-'));

/** Path to a series ledger. */
const ledgerPath = (root: string, name: string): string =>
  join(root, '.agents', '@montflow', 'reviews', name, 'REVIEW.md');

/** Write a minimal decodable `PROFILE.md` for a profile slug. */
const writeProfile = async (root: string, name: string, model = ''): Promise<void> => {
  const dir = join(root, '.agents', '@montflow', 'profiles', name);
  await mkdir(dir, { recursive: true });
  const markdown = [
    '---',
    `name: ${name}`,
    `description: ${name} reviewer`,
    `model: ${model}`,
    'skills:',
    '  - montflow-adversarial-review',
    '---',
    '',
    `# ${name}`,
    '',
    '## Instructions',
    '',
    'Review the phase.',
    '',
    '## Review Checklist',
    '',
    '- [ ] Check the work.',
    '',
  ].join('\n');
  await writeFile(join(dir, 'PROFILE.md'), markdown, 'utf8');
};

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
    wait: () => Effect.void,
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
  Vitest.it('builds a prompt naming the series, round, phase, profile, and skills', () => {
    const prompt = Dispatch.reviewerPrompt(
      {
        root: '/repo',
        name: 'ship-spec-a',
        target: 'the phase',
        spec: 'ship-spec',
        profile: 'a',
        round: '003',
        phase: 'C',
      },
      ['montflow-adversarial-review'],
    );
    Vitest.expect(prompt).toContain("series 'ship-spec-a'");
    Vitest.expect(prompt).toContain('montflow-adversarial-review');
    Vitest.expect(prompt).toContain('- Spec: ship-spec');
    Vitest.expect(prompt).toContain('- Profile: a');
    Vitest.expect(prompt).toContain('- Round: 003');
    Vitest.expect(prompt).toContain('- Phase: C');
    Vitest.expect(prompt).toContain('- Workspace root: /repo');
    Vitest.expect(prompt).toContain(
      "Load the 'montflow-adversarial-review' skill before starting.",
    );
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

  Vitest.it.effect('fails on an unknown profile without creating a series or a session', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dispatched: Array<Dispatched> = [];
      const error = yield* Dispatch.startReview(makePorts(dispatched), {
        root,
        name: 'demo-effect-reviewer',
        profile: 'effect-reviewer',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBe(
        "Cannot dispatch review series 'demo-effect-reviewer': profile 'effect-reviewer' was not found under .agents/@montflow/profiles.",
      );
      const exists = yield* Effect.promise(() =>
        readFile(ledgerPath(root, 'demo-effect-reviewer'), 'utf8').then(
          () => true,
          () => false,
        ),
      );
      Vitest.expect(exists).toBe(false);
      Vitest.expect(dispatched).toStrictEqual([]);
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('rejects a profile name that does not compose the series (with a spec)', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer'));
      const error = yield* Dispatch.startReview(makePorts([]), {
        root,
        name: 'demo-generic-reviewer',
        spec: 'demo',
        profile: 'effect-reviewer',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBe(
        "Cannot dispatch review series 'demo-generic-reviewer': profile 'effect-reviewer' belongs to series 'demo-effect-reviewer'.",
      );
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('rejects a name without the profile suffix (no spec)', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer'));
      const error = yield* Dispatch.startReview(makePorts([]), {
        root,
        name: 'spec-effect-reviewer',
        profile: 'generic-reviewer',
      }).pipe(Effect.flip);
      // `generic-reviewer` is not on disk, so resolve fails first — write it too.
      Vitest.expect(error).toContain('generic-reviewer');
      yield* Effect.promise(() => writeProfile(root, 'generic-reviewer'));
      const mismatch = yield* Dispatch.startReview(makePorts([]), {
        root,
        name: 'spec-effect-reviewer',
        profile: 'generic-reviewer',
      }).pipe(Effect.flip);
      Vitest.expect(mismatch).toBe(
        "Cannot dispatch review series 'spec-effect-reviewer': profile 'generic-reviewer' is not the series-name suffix.",
      );
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('stamps a pre-created unstamped ledger and is idempotent', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer'));
      // Pre-create the series without a profile (as `mf-reviews create` would).
      yield* Effect.promise(async () => {
        const dir = join(root, '.agents', '@montflow', 'reviews', 'demo-effect-reviewer');
        await mkdir(dir, { recursive: true });
        await writeFile(
          ledgerPath(root, 'demo-effect-reviewer'),
          [
            '# Review Series: demo-effect-reviewer',
            '',
            '## Metadata',
            '- Target: demo',
            '- Status: open',
            '- Rounds: 0',
            '- Created: 2026-10-01',
            '',
            '## Rounds',
            '',
            "| Round | Status | Open | In Review | Resolved | Won't Fix | Escalated |",
            '| ----- | ------ | ---- | --------- | -------- | --------- | --------- |',
            '',
            '## Findings',
            '',
            '| Round | ID | Severity | Status | Title |',
            '| ----- | -- | -------- | ------ | ----- |',
            '',
          ].join('\n'),
          'utf8',
        );
      });
      yield* Dispatch.startReview(makePorts([]), {
        root,
        name: 'demo-effect-reviewer',
        profile: 'effect-reviewer',
      });
      const ledger = yield* Effect.promise(() =>
        readFile(ledgerPath(root, 'demo-effect-reviewer'), 'utf8'),
      );
      Vitest.expect(ledger).toContain('- Profile: effect-reviewer');
      Vitest.expect(ledger).toContain('- Target: demo');
      Vitest.expect(ledger).toContain('- Created: 2026-10-01');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to rebind a ledger already bound to another profile', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer'));
      yield* Effect.promise(() => writeProfile(root, 'generic-reviewer'));
      yield* Effect.promise(async () => {
        const dir = join(root, '.agents', '@montflow', 'reviews', 'demo-effect-reviewer');
        await mkdir(dir, { recursive: true });
        await writeFile(
          ledgerPath(root, 'demo-effect-reviewer'),
          "# Review Series: demo-effect-reviewer\n\n## Metadata\n- Target: demo\n- Status: open\n- Rounds: 0\n- Profile: generic-reviewer\n- Created: 2026-10-01\n\n## Rounds\n\n| Round | Status | Open | In Review | Resolved | Won't Fix | Escalated |\n| ----- | ------ | ---- | --------- | -------- | --------- | --------- |\n\n## Findings\n\n| Round | ID | Severity | Status | Title |\n| ----- | -- | -------- | ------ | ----- |\n",
          'utf8',
        );
      });
      const error = yield* Dispatch.startReview(makePorts([]), {
        root,
        name: 'demo-effect-reviewer',
        profile: 'effect-reviewer',
      }).pipe(Effect.flip);
      Vitest.expect(error).toBe(
        "Series 'demo-effect-reviewer' is already bound to profile 'generic-reviewer'; refusing to dispatch profile 'effect-reviewer'.",
      );
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('dispatches one session per profile with the profile model applied', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      yield* Effect.promise(() => writeProfile(root, 'effect-reviewer', 'anthropic/claude-x'));
      yield* Effect.promise(() => writeProfile(root, 'generic-reviewer', ''));
      const dispatched: Array<Dispatched> = [];
      const labels: Array<string> = [];
      const ports = makePorts(dispatched, labels);

      const first = yield* Dispatch.startReview(ports, {
        root,
        name: 'demo-effect-reviewer',
        spec: 'demo',
        profile: 'effect-reviewer',
        model: 'openai/gpt-z',
        round: '003',
        phase: 'C',
      });
      const second = yield* Dispatch.startReview(ports, {
        root,
        name: 'demo-generic-reviewer',
        spec: 'demo',
        profile: 'generic-reviewer',
        model: 'openai/gpt-z',
        round: '003',
        phase: 'C',
      });

      Vitest.expect(first.series).toBe('demo-effect-reviewer');
      Vitest.expect(second.series).toBe('demo-generic-reviewer');
      Vitest.expect(dispatched).toHaveLength(2);
      // A non-blank profile model overrides the request pin; a blank one falls back.
      Vitest.expect(labels).toStrictEqual(['anthropic/claude-x', 'openai/gpt-z']);
      Vitest.expect(dispatched[0]?.prompt).toContain('- Round: 003');
      Vitest.expect(dispatched[0]?.prompt).toContain('- Phase: C');
      Vitest.expect(dispatched[0]?.prompt).toContain('- Profile: effect-reviewer');
      Vitest.expect(dispatched[0]?.prompt).toContain(
        "Load the 'montflow-adversarial-review' skill before starting.",
      );
      const firstLedger = yield* Effect.promise(() =>
        readFile(ledgerPath(root, 'demo-effect-reviewer'), 'utf8'),
      );
      Vitest.expect(firstLedger).toContain('- Profile: effect-reviewer');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('leaves a single-reviewer dispatch unchanged when no profile is declared', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const dispatched: Array<Dispatched> = [];
      const labels: Array<string> = [];
      const result = yield* Dispatch.startReview(makePorts(dispatched, labels), {
        root,
        name: 'demo',
        model: 'openai/gpt-z',
      });
      Vitest.expect(result.series).toBe('demo');
      Vitest.expect(dispatched).toHaveLength(1);
      Vitest.expect(labels).toStrictEqual(['openai/gpt-z']);
      Vitest.expect(dispatched[0]?.prompt).not.toContain('- Profile:');
      const ledger = yield* Effect.promise(() => readFile(ledgerPath(root, 'demo'), 'utf8'));
      Vitest.expect(ledger).not.toContain('- Profile:');
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
