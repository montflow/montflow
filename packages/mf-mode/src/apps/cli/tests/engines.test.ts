import * as Fs from 'node:fs';
import * as Os from 'node:os';
import * as NodePath from 'node:path';
import * as Vitest from '@effect/vitest';
import { Cause, Effect, Exit, Layer } from 'effect';
import type * as Dispatch from '../../../modules/dispatch/index.js';
import { Host } from '../../../services/index.js';
import { Engines, Renderers } from '../index.js';

const freshRoot = (): string => Fs.mkdtempSync(NodePath.join(Os.tmpdir(), 'mf-mode-cli-'));

const layer = (options: Parameters<typeof Host.fake>[0]) =>
  Layer.mergeAll(Engines.StoreLive, Host.fake(options));

/** The refusal text of a failed engine call. */
const failure = <A>(exit: Exit.Exit<A, string>): string =>
  Exit.isFailure(exit) ? String(Cause.squash(exit.cause)) : '';

Vitest.describe('roles engines', () => {
  Vitest.it.effect('show lists every role as default until one is set', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const before = yield* Engines.show(root);
      Vitest.expect(Renderers.show(before).split('\n')).toContain('bug-fix: default');

      yield* Engines.set(root, 'bug-fix', ['claude-code:opus:xhigh,codex:gpt-5.5:high']);
      const after = yield* Engines.show(root);
      Vitest.expect(Renderers.show(after).split('\n')).toContain(
        'bug-fix: claude-code:opus:xhigh,codex:gpt-5.5:high',
      );
      Vitest.expect(
        Fs.readFileSync(NodePath.join(root, '.agents/@montflow/mode/.gitignore'), 'utf8'),
      ).toBe('*\n');

      yield* Engines.unset(root, 'bug-fix');
      Vitest.expect(Renderers.show(yield* Engines.show(root)).split('\n')).toContain(
        'bug-fix: default',
      );
    }).pipe(Effect.provide(layer({}))),
  );

  Vitest.it.effect('set refuses a combination its harness rejects and writes nothing', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const exit = yield* Effect.exit(Engines.set(root, 'feature', ['codex:fable']));
      Vitest.expect(failure(exit)).toContain('codex runs OpenAI models only');
      Vitest.expect(Fs.existsSync(NodePath.join(root, '.agents/@montflow/mode/roles.json'))).toBe(
        false,
      );
      Vitest.expect(
        failure(yield* Effect.exit(Engines.set(root, 'nope', ['codex:gpt-5.5']))),
      ).toContain("Unknown role 'nope'");
      Vitest.expect(
        failure(
          yield* Effect.exit(Engines.set(root, 'feature', ['codex:gpt-5.5', 'codex:gpt-5.4'])),
        ),
      ).toContain('not a panel');
    }).pipe(Effect.provide(layer({}))),
  );

  Vitest.it.effect('verify reports a hand-edited file, and nothing resolves from it', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      const empty = yield* Engines.verify(root);
      Vitest.expect(Renderers.verify(empty)).toMatch(
        /^no-file path=.*\nsummary issues=0 warnings=0$/,
      );

      const dir = NodePath.join(root, '.agents/@montflow/mode');
      Fs.mkdirSync(dir, { recursive: true });
      Fs.writeFileSync(
        NodePath.join(dir, 'roles.json'),
        JSON.stringify({
          version: 1,
          roles: { feature: [[{ harness: 'codex', model: 'fable' }]] },
        }),
      );
      const report = yield* Engines.verify(root);
      Vitest.expect(report.errorCount).toBe(1);
      Vitest.expect(Renderers.verify(report)).toContain('error [roles.feature[1][1].model]');
      Vitest.expect(
        failure(yield* Effect.exit(Engines.resolve(root, 'feature', 'claude-code'))),
      ).toContain('mf-mode roles verify');
    }).pipe(Effect.provide(layer({}))),
  );

  Vitest.it.effect('resolve renders one actionable line per seat', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* Engines.set(root, 'interrogate-reviewers', [
        'claude-code:fable:high',
        'pi:openai/gpt-5.5,codex:gpt-5.5:high',
        'pi:google/gemini-4-neon',
      ]);
      const resolution = yield* Engines.resolve(root, 'interrogate-reviewers', undefined);
      Vitest.expect(Renderers.resolve(resolution).split('\n')).toEqual([
        'role=interrogate-reviewers source=set current=claude-code seats=3',
        'seat=1 run=native harness=claude-code model=fable effort=high next="spawn with your subagent tool on this model and effort"',
        'seat=2 run=dispatch harness=codex model=gpt-5.5 effort=high next="mf-mode dispatch interrogate-reviewers --seat 2 --brief <file>"',
        'seat=3 run=dropped skipped="pi:google/gemini-4-neon (pi not installed)" next="skip this seat and say so"',
      ]);
      const unset = yield* Engines.resolve(root, 'feature', undefined);
      Vitest.expect(Renderers.resolve(unset)).toContain('source=default');
      Vitest.expect(Renderers.resolve(unset)).toContain('model=default');
    }).pipe(Effect.provide(layer({ env: { CLAUDECODE: '1' }, installed: ['codex'] }))),
  );

  Vitest.it.effect('resolve refuses to guess the harness', () =>
    Effect.gen(function* () {
      const exit = yield* Effect.exit(Engines.resolve(freshRoot(), 'feature', undefined));
      Vitest.expect(failure(exit)).toContain('Pass --harness');
      const bad = yield* Effect.exit(Engines.resolve(freshRoot(), 'feature', 'cursor'));
      Vitest.expect(failure(bad)).toContain("'cursor' is not a harness");
    }).pipe(Effect.provide(layer({}))),
  );
});

const setup = (root: string) =>
  Effect.gen(function* () {
    yield* Engines.set(root, 'arena-runners', ['claude-code:opus', 'codex:gpt-5.5:high']);
    Fs.writeFileSync(NodePath.join(root, 'brief.md'), 'Fix the bug.\n');
    const profile = NodePath.join(root, '.agents/@montflow/profiles/mf-mode-generic-worker');
    Fs.mkdirSync(profile, { recursive: true });
    Fs.writeFileSync(
      NodePath.join(profile, 'PROFILE.md'),
      '---\nname: w\n---\n# Worker\n\nRead mf-mode.\n',
    );
  });

const options = (root: string, seat: number): Engines.DispatchOptions => ({
  role: 'arena-runners',
  seat,
  brief: NodePath.join(root, 'brief.md'),
  profile: Engines.DEFAULT_PROFILE,
  access: 'write',
  harness: undefined,
  dryRun: false,
});

Vitest.describe('dispatch engine', () => {
  const runs: Array<Dispatch.Plan> = [];

  Vitest.it.effect('runs a dispatch seat as the profile, in the workspace', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* setup(root);
      const result = yield* Engines.dispatch(root, options(root, 2));
      Vitest.expect(result.exitCode).toBe(3);
      Vitest.expect(runs).toHaveLength(1);
      const [plan] = runs;
      Vitest.expect(plan?.binary).toBe('codex');
      Vitest.expect(plan?.stdin).toBe(
        '# Worker\n\nRead mf-mode.\n\n---\n\n# Task\n\nFix the bug.\n',
      );
      Vitest.expect(result.command).toContain('codex exec --model gpt-5.5');

      const dry = yield* Engines.dispatch(root, { ...options(root, 2), dryRun: true });
      Vitest.expect(dry.exitCode).toBeUndefined();
      Vitest.expect(runs).toHaveLength(1);
    }).pipe(
      Effect.provide(layer({ env: { CLAUDECODE: '1' }, installed: ['codex'], exitCode: 3, runs })),
    ),
  );

  Vitest.it.effect('refuses a native seat, a missing seat, and a missing profile', () =>
    Effect.gen(function* () {
      const root = freshRoot();
      yield* setup(root);
      Vitest.expect(
        failure(yield* Effect.exit(Engines.dispatch(root, options(root, 1)))),
      ).toContain('runs natively on claude-code');
      Vitest.expect(
        failure(yield* Effect.exit(Engines.dispatch(root, options(root, 9)))),
      ).toContain('has 2 seats, not 9');
      Vitest.expect(
        failure(
          yield* Effect.exit(Engines.dispatch(root, { ...options(root, 2), profile: 'ghost' })),
        ),
      ).toContain('mf-profiles doctor');
    }).pipe(Effect.provide(layer({ env: { CLAUDECODE: '1' }, installed: ['codex'] }))),
  );
});
