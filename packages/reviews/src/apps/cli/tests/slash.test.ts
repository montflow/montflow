import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import { ProfileStore } from '@montflow/profiles/services';
import { SpecStore } from '@montflow/specs/services';
import { ProfileProbe, ReviewStore } from '../../../services/index.js';
import * as Slash from '../slash.apps.module.js';

const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);
const Live = Layer.mergeAll(
  Layer.provide(ReviewStore.Default, NodeLive),
  ProfileProbe.Default,
  Layer.provide(SpecStore.Default, NodeLive),
  Layer.provide(ProfileStore.Default, NodeLive),
);

/** A throwaway repo root. */
const freshRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-reviews-slash-'));

/** A UI stub that records notifications. */
const recordingUi = (messages: Array<string>): Slash.CliUi => ({
  notify: (message) => messages.push(message),
});

Vitest.describe('/mf-reviews parser', () => {
  Vitest.it('parses a `--profile` flag on create', () => {
    Vitest.expect(
      Slash.parseCliArgs('create demo-effect-reviewer --profile effect-reviewer'),
    ).toEqual({
      kind: 'Create',
      name: 'demo-effect-reviewer',
      target: undefined,
      profile: 'effect-reviewer',
      round: undefined,
      dir: undefined,
    });
  });

  Vitest.it('still treats an unknown flag as help', () => {
    Vitest.expect(Slash.parseCliArgs('create demo --nope x')).toEqual({ kind: 'Help' });
  });

  Vitest.it.effect('threads the profile through run and stamps the ledger', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(freshRoot);
      const messages: Array<string> = [];
      yield* Slash.run(
        `create demo-effect-reviewer --profile effect-reviewer --dir ${root}`,
        recordingUi(messages),
        root,
      );
      const ledger = yield* Effect.promise(() =>
        readFile(
          join(root, '.agents', '@montflow', 'reviews', 'demo-effect-reviewer', 'REVIEW.md'),
          'utf8',
        ),
      );
      Vitest.expect(ledger).toContain('- Profile: effect-reviewer');
      Vitest.expect(messages.join('\n')).toContain("series 'demo-effect-reviewer'");
      yield* Effect.promise(() => rm(root, { recursive: true, force: true }));
    }).pipe(Effect.provide(Live)),
  );
});
