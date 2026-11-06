import * as NodePath from 'node:path';
import { NodeFileSystem, NodePath as PlatformPath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import { PromptStore } from '@montflow/prompts';
import { Command } from 'effect/cli';
import { Effect, FileSystem, Layer, Path, Stdio, Terminal } from 'effect';
import { ChildProcessSpawner } from 'effect/process';
import { TestConsole } from 'effect/testing';
import { runDoctor } from '../../../modules/doctor/index.js';
import { phaseMarkdown } from '../../../modules/phase/tests/helpers.js';
import { load } from '../../../modules/prompt/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  check,
  reduceCheck,
  renderCheck,
  renderState,
  renderStatus,
  state,
  status,
  statusReport,
  statusReportCommand,
} from '../index.js';

/**
 * The binary `status-report` surface is the only one that prints the rendered
 * prompt, so these tests invoke the real `Command` and compare its output to the
 * engine. A workspace other than the process cwd proves `--dir` is carried both
 * into resolution and into the command forms the prompt tells the agent to run.
 */

const Platform = Layer.merge(NodeFileSystem.layer, PlatformPath.layer);
const EngineLive = Layer.mergeAll(
  Layer.provideMerge(SpecStore.Default, Platform),
  Layer.provideMerge(PromptStore.Default, Platform),
);

/** Everything `Command.runWith` needs besides the stores the command provides. */
const CommandLive = Layer.mergeAll(
  NodeFileSystem.layer,
  PlatformPath.layer,
  Stdio.layerTest({}),
  Layer.succeed(
    Terminal.Terminal,
    Terminal.make({
      columns: Effect.succeed(120),
      rows: Effect.succeed(40),
      readInput: Effect.die('unused'),
      readLine: Effect.die('unused'),
      display: () => Effect.void,
    }),
  ),
  Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make(() => Effect.die('unused')),
  ),
);

/** Run the shipped command with explicit argv, the way the binary does. */
const runBinary = (args: ReadonlyArray<string>) =>
  Command.runWith(statusReportCommand, { version: '0.0.0' })(args);

/** Everything the binary printed, as one string. */
const printed = (): Effect.Effect<string> =>
  TestConsole.logLines.pipe(Effect.map((lines) => lines.map(String).join('\n')));

/** Write one fixture file, creating its parent directory. */
const writeFixture = (target: string, content: string) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(NodePath.dirname(target), { recursive: true });
    yield* fs.writeFileString(target, content);
  });

/** The spec name the stale-gate fixture uses. */
const DRIFT_SPEC = 'drift-spec';

/**
 * A valid v2 spec whose task records a keyed gate pass that no longer matches
 * the current `app/` fingerprint. `status` verifies the tree, while `check`
 * adds `gate.stale-result`, so the two commands disagree exactly as the real
 * report must reconcile.
 * @param workspace - temp workspace root
 * @returns the spec store directory under that workspace
 */
const staleGateSpec = (workspace: string) =>
  Effect.gen(function* () {
    const store = NodePath.join(workspace, '.agents', '@montflow', 'specs');
    const spec = NodePath.join(store, DRIFT_SPEC);
    const phase = NodePath.join(spec, 'A');
    const task = NodePath.join(phase, 'A001-implement-login');
    const review = NodePath.join(phase, 'A099-review-phase');
    yield* writeFixture(
      NodePath.join(spec, 'SPEC.md'),
      specMarkdown({
        name: DRIFT_SPEC,
        version: '2',
        rows: [
          {
            id: 'A001',
            name: 'implement-login',
            type: 'execution',
            status: 'pending',
            gates: 'Yes',
          },
          {
            id: 'A099',
            name: 'review-phase',
            type: 'review',
            status: 'pending',
            gates: 'No',
          },
        ],
      }),
    );
    yield* writeFixture(NodePath.join(phase, 'PHASE.md'), phaseMarkdown({ id: 'A' }));
    yield* writeFixture(NodePath.join(phase, 'MEMORY.md'), memoryMarkdown());
    yield* writeFixture(
      NodePath.join(task, 'TASK.md'),
      taskMarkdown({ id: 'A001', name: 'implement-login', writeScope: 'app', size: 'tiny' }),
    );
    yield* writeFixture(NodePath.join(task, 'MEMORY.md'), memoryMarkdown());
    yield* writeFixture(
      NodePath.join(task, 'GATES.md'),
      [
        '## Stage 0: Proof (mechanical)',
        'command: bun run test',
        'scope: app',
        '',
        '- [ ] The proof passes.',
        '',
      ].join('\n'),
    );
    yield* writeFixture(
      NodePath.join(task, 'GATE-RESULTS.jsonl'),
      `${JSON.stringify({
        stage: 0,
        title: 'Proof',
        kind: 'mechanical',
        command: 'bun run test',
        exit: 0,
        verdict: 'pass',
        at: '2026-01-01T00:00:00Z',
        output: '',
        scope: ['app'],
        key: 'gate-v1:deadbeef',
        fingerprint: 'deadbeef',
      })}\n`,
    );
    yield* writeFixture(
      NodePath.join(review, 'TASK.md'),
      taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', size: 'medium' }),
    );
    yield* writeFixture(NodePath.join(review, 'MEMORY.md'), memoryMarkdown());
    yield* writeFixture(NodePath.join(workspace, 'app', 'source.txt'), 'one\n');
    return store;
  });

Vitest.describe('Cli.statusReport binary runtime', () => {
  Vitest.it.effect('wires --name/--focus/--dir and prints exactly the engine text', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-status-bin-' });
      const store = path.join(workspace, '.agents', '@montflow', 'specs');
      yield* fs.makeDirectory(path.join(store, 'ok'), { recursive: true });
      yield* fs.writeFileString(path.join(store, 'ok', 'SPEC.md'), '---\nname: ok\n---\n');
      yield* runDoctor(workspace);

      yield* runBinary(['--name', 'ok', '--focus', 'review risk', '--dir', workspace]);
      const output = yield* printed();

      const engine = yield* statusReport(store, {
        name: 'ok',
        focus: 'review risk',
        workspace,
      }).pipe(Effect.provide(EngineLive));

      Vitest.expect(output).toBe(engine.prompt.text);
      Vitest.expect(output).toContain('Focus this report on: review risk');
      Vitest.expect(output).toContain(`--dir "${workspace}"`);
      Vitest.expect(output).toContain('mf-specs state --name ok');
      Vitest.expect(output).toContain('mf-specs check --name ok');
    }).pipe(Effect.provide(CommandLive)),
  );
});

Vitest.describe('spec-status section 8 source', () => {
  Vitest.it.effect(
    'names `check` as the verdict source, and `check` prints it while `status` only verifies the tree',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-status-src-' });
        yield* runDoctor(workspace);
        const store = yield* staleGateSpec(workspace);

        const checked = yield* check(store, { name: DRIFT_SPEC });
        const checkedText = renderCheck(checked, false);
        const statusReported = yield* status(store, DRIFT_SPEC);
        const statusText = renderStatus(statusReported);
        const loaded = yield* load(workspace, 'spec-status', {
          name: DRIFT_SPEC,
          root: workspace,
        });

        // The same spec: `check` fails on the stale gate, `status` verifies the tree.
        Vitest.expect(checkedText).toMatch(/^✗ drift-spec \(\d+/mu);
        Vitest.expect(checkedText).toContain('gate.stale-result');
        Vitest.expect(statusText).toContain('verify ✓ verified');

        const section = loaded.text.slice(
          loaded.text.indexOf('Verification result and blocking codes'),
          loaded.text.indexOf('Review evidence'),
        );
        Vitest.expect(section).toContain('`check` verdict line');
        Vitest.expect(section).toContain('✗ <spec> (n)');
        Vitest.expect(section).toContain('`status` `verify` line is the tree verifier only');
        Vitest.expect(section).not.toContain('verify <✓ verified or ✗ n issues>');
        Vitest.expect(loaded.text).toContain(`--dir "${workspace}"`);
      }).pipe(Effect.provide(EngineLive)),
  );
});

Vitest.describe('spec-status section 8 verdict shapes', () => {
  Vitest.it('names the clean summary and the warning-only pass `check` prints', () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-status-shapes-' });
      yield* runDoctor(workspace);
      const root = NodePath.join(workspace, '.agents', '@montflow', 'specs');

      const clean = reduceCheck(root, [{ name: 'clean-spec', issues: [] }], false);
      const cleanText = renderCheck(clean, false);
      Vitest.expect(cleanText).toBe('1 spec · 0 failed · 0 issues');
      Vitest.expect(cleanText).not.toContain('clean-spec');

      const warned = reduceCheck(
        root,
        [
          {
            name: 'warn-spec',
            issues: [{ field: 'metrics', message: 'No metrics recorded.', severity: 'warning' }],
          },
        ],
        false,
      );
      Vitest.expect(renderCheck(warned, false)).toContain('✓ warn-spec (1 warning)');

      const loaded = yield* load(workspace, 'spec-status', { name: 'clean-spec', root: workspace });
      const section = loaded.text.slice(
        loaded.text.indexOf('Verification result and blocking codes'),
        loaded.text.indexOf('Review evidence'),
      );
      Vitest.expect(section).toContain('✓ <spec> (m warnings)');
      Vitest.expect(section).toContain('1 spec · 0 failed · 0 issues');
    }).pipe(Effect.provide(EngineLive)),
  );
});

Vitest.describe('spec-status missing SPEC.md precedence', () => {
  Vitest.it.effect(
    'reports unreadable, inconsistent, and blocked together and selects the unreadable line',
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const workspace = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-status-nospec-' });
        yield* runDoctor(workspace);
        const store = path.join(workspace, '.agents', '@montflow', 'specs');
        yield* fs.makeDirectory(path.join(store, 'broken'), { recursive: true });

        const reported = yield* state(store, 'broken');
        const stateText = renderState(reported);
        Vitest.expect(stateText).toContain('broken · unreadable · state inconsistent');
        Vitest.expect(stateText).toContain('blocked unspecified');

        const checked = yield* check(store, { name: 'broken' });
        const checkedText = renderCheck(checked, false);
        Vitest.expect(checkedText).toContain('✗ broken (1)');
        Vitest.expect(checkedText).toContain('SPEC.md: Required file is missing');

        const loaded = yield* load(workspace, 'spec-status', { name: 'broken', root: workspace });
        Vitest.expect(loaded.text).toContain(
          'A missing or unreadable `SPEC.md` selects the `unreadable SPEC.md` line before the state lines',
        );
        Vitest.expect(loaded.text).toContain('unreadable SPEC.md · no code / SPEC.md');
      }).pipe(Effect.provide(EngineLive)),
  );
});
