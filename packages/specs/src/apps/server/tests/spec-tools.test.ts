import { NodeFileSystem, NodePath } from '@effect/platform-node';
import * as Vitest from '@effect/vitest';
import type { PromptExecute } from '@montflow/prompts';
import { PromptStore } from '@montflow/prompts';
import type { ToolDefinition, ToolRunContext } from '@montflow/opencode';
import { Effect, FileSystem, Layer, Path, Schema, Cause } from 'effect';
import { runDoctor } from '../../../modules/doctor/index.js';
import { specMarkdown } from '../../../modules/spec/tests/helpers.js';
import { memoryMarkdown, taskMarkdown } from '../../../modules/task/tests/helpers.js';
import { SpecStore } from '../../../services/index.js';
import {
  DEFAULT_ROOT,
  diagnoseCause,
  listModels,
  models,
  sizingConfig,
  verifyModels,
} from '../../cli/index.js';
import * as Catalogue from '../../../modules/catalogue/index.js';
import {
  SpecAuthorInput,
  SpecExecuteInput,
  SpecModelsInput,
  SpecSizingInput,
  specAuthorTool,
  specExecuteTool,
  specModelsTool,
  specSizingTool,
  type SpecToolOptions,
} from '../index.js';

/**
 * The host tools must load and render the same prompts as the binary and then
 * hand the rendered text to the injected executor. These tests use a fake
 * executor, so they prove the request shape and never touch a model.
 */

const Platform = Layer.merge(NodeFileSystem.layer, NodePath.layer);

interface Work {
  readonly fs: FileSystem.FileSystem;
  readonly path: Path.Path;
  readonly dir: string;
  readonly root: string;
}

const prepare = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const dir = yield* fs.makeTempDirectoryScoped({ prefix: 'mf-specs-tools-' });
  return { fs, path, dir, root: path.join(dir, DEFAULT_ROOT) };
});

const seed = (work: Work, name: string, files: ReadonlyArray<readonly [string, string]>) =>
  Effect.gen(function* () {
    const base = work.path.join(work.root, name);
    yield* work.fs.makeDirectory(base, { recursive: true });
    for (const [relative, content] of files) {
      const target = work.path.join(base, relative);
      yield* work.fs.makeDirectory(work.path.dirname(target), { recursive: true });
      yield* work.fs.writeFileString(target, content);
    }
  });

const phaseA = (spec: string): ReadonlyArray<readonly [string, string]> => [
  ['SPEC.md', specMarkdown({ name: spec })],
  [
    'A001-implement-login/TASK.md',
    taskMarkdown({ id: 'A001', name: 'implement-login', size: 'tiny' }),
  ],
  ['A001-implement-login/MEMORY.md', memoryMarkdown()],
  [
    'A099-review-phase/TASK.md',
    taskMarkdown({ id: 'A099', name: 'review-phase', type: 'review', status: 'pending' }),
  ],
  ['A099-review-phase/MEMORY.md', memoryMarkdown()],
];

const branch = (work: Work, name: string) =>
  Effect.gen(function* () {
    const git = work.path.join(work.dir, '.git');
    yield* work.fs.makeDirectory(git, { recursive: true });
    yield* work.fs.writeFileString(work.path.join(git, 'HEAD'), `ref: refs/heads/${name}\n`);
  });

/** The two review skills the execution prompt declares but doctor does not own. */
const REVIEW_SKILLS = [
  'montflow-adversarial-review',
  'montflow-addressing-adversarial-review',
] as const;

/** Doctor plus the review skills, so a rendered execute is dispatchable. */
const preparePrompts = (work: Work) =>
  Effect.gen(function* () {
    yield* runDoctor(work.dir);
    for (const name of REVIEW_SKILLS) {
      const dir = work.path.join(work.dir, '.agents', 'skills', name);
      yield* work.fs.makeDirectory(dir, { recursive: true });
      yield* work.fs.writeFileString(
        work.path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
  });

/** Doctor prompts plus the three foreign skills the sizing wizard declares. */
const prepareSizingPrompts = (work: Work) =>
  Effect.gen(function* () {
    yield* runDoctor(work.dir);
    for (const name of ['executing-skills', 'grilling', 'i-have-adhd']) {
      const dir = work.path.join(work.dir, '.agents', 'skills', name);
      yield* work.fs.makeDirectory(dir, { recursive: true });
      yield* work.fs.writeFileString(
        work.path.join(dir, 'SKILL.md'),
        `---\nname: ${name}\ndescription: fixture\n---\n`,
      );
    }
  });

/** A recording executor: no model, no session, just the requests it saw. */
const recorder = () => {
  const runs: Array<PromptExecute.ExecutionRequest> = [];
  const execute: PromptExecute.PromptExecutor = (request) =>
    Effect.sync(() => {
      runs.push(request);
      return 'dispatched reply';
    });
  return { runs, execute };
};

/** Call a tool descriptor the way the host does, with a fake session identity. */
const runTool = <A>(tool: ToolDefinition<A>, input: A): Effect.Effect<string, string> => {
  // SAFETY: only the two branded ids are read; a literal string is the same
  // runtime shape the host fills the context with.
  const context = { sessionID: 'ses_test', agentID: 'agent_test' } as ToolRunContext;
  return tool.execute(input, context);
};

const options = (work: Work, overrides: Partial<SpecToolOptions> = {}): SpecToolOptions => ({
  cwd: work.dir,
  execute: recorder().execute,
  ...overrides,
});

Vitest.describe('spec_author tool', () => {
  Vitest.it.effect('decodes the documented input and rejects a missing request', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(SpecAuthorInput)({
        request: 'Ship login',
        notes: 'Be careful',
        model: 'fixture/model',
      });
      Vitest.expect(decoded.request).toBe('Ship login');

      const failure = yield* Schema.decodeUnknownEffect(SpecAuthorInput)({}).pipe(Effect.flip);
      Vitest.expect(String(failure)).toContain('request');
    }),
  );

  Vitest.it.effect('renders spec-create and dispatches it through the shared executor', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* runDoctor(work.dir);
      const fake = recorder();

      const tool = specAuthorTool(
        options(work, {
          execute: fake.execute,
          defaultModel: () => Effect.succeed('fixture/default'),
        }),
      );
      const reply = yield* runTool(tool, { request: 'Ship login' });

      Vitest.expect(reply).toBe('dispatched reply');
      Vitest.expect(fake.runs).toHaveLength(1);
      const run = fake.runs[0];
      Vitest.expect(run?.name).toBe('spec-create');
      Vitest.expect(run?.model).toBe('fixture/default');
      Vitest.expect(run?.cwd).toBe(work.dir);
      Vitest.expect(run?.text).toContain('Ship login');
      Vitest.expect(run?.text).toContain('## 4. Size every task');
      Vitest.expect(run?.skills).toStrictEqual(['montflow-create-specs']);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('returns the doctor diagnostic instead of dispatching on a missing prompt', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const fake = recorder();
      const tool = specAuthorTool(options(work, { execute: fake.execute }));

      const failure = yield* runTool(tool, { request: 'Ship login' }).pipe(Effect.flip);
      Vitest.expect(failure).toContain('code     prompt.missing');
      Vitest.expect(failure).toContain('fix      Run mf-specs doctor');
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );
});

Vitest.describe('spec_execute tool', () => {
  Vitest.it.effect('decodes the documented input', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(SpecExecuteInput)({
        name: 'ship-login',
        phase: 'A',
        focus: 'Keep it small',
        mode: 'autonomous',
        model: 'fixture/model',
      });
      Vitest.expect(decoded.mode).toBe('autonomous');
      Vitest.expect(decoded.name).toBe('ship-login');
    }),
  );

  Vitest.it.effect('derives state and budget, renders spec-execute, and dispatches it', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login'));
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(
        options(work, {
          execute: fake.execute,
          defaultModel: () => Effect.succeed('fixture/default'),
        }),
      );
      const reply = yield* runTool(tool, {
        name: 'ship-login',
        mode: 'autonomous',
        focus: 'Keep it small',
      });

      Vitest.expect(reply).toBe('dispatched reply');
      const run = fake.runs[0];
      Vitest.expect(run?.name).toBe('spec-execute');
      Vitest.expect(run?.model).toBe('fixture/default');
      Vitest.expect(run?.text).toContain('ship-login');
      Vitest.expect(run?.text).toContain('phase A');
      Vitest.expect(run?.text).toContain('budget is 1');
      Vitest.expect(run?.text).toContain('Ask only for');
      Vitest.expect(run?.text).toContain('Keep it small');
      Vitest.expect(run?.skills).toStrictEqual([
        'montflow-find-specs',
        'montflow-adversarial-review',
        'montflow-addressing-adversarial-review',
      ]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('resolves an omitted name from the branch before dispatching', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login'));
      yield* branch(work, 'feat/ship-login');
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      yield* runTool(tool, { model: 'fixture/explicit' });

      const run = fake.runs[0];
      Vitest.expect(run?.model).toBe('fixture/explicit');
      Vitest.expect(run?.text).toContain('ship-login');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('returns the ambiguous-branch diagnostic and never dispatches', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'spec-one', phaseA('spec-one'));
      yield* seed(work, 'spec-two', phaseA('spec-two'));
      yield* branch(work, 'feat/spec');
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      const failure = yield* runTool(tool, { model: 'fixture/model' }).pipe(Effect.flip);

      Vitest.expect(failure).toContain('code     SPEC_AMBIGUOUS');
      Vitest.expect(failure).toContain('--name spec-one');
      Vitest.expect(failure).toContain('--name spec-two');
      Vitest.expect(failure).toContain('next     ask the user');
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('lets an explicit name win over an ambiguous branch', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'spec-one', phaseA('spec-one'));
      yield* seed(work, 'spec-two', phaseA('spec-two'));
      yield* branch(work, 'feat/spec');
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      const reply = yield* runTool(tool, { name: 'spec-one', model: 'fixture/model' });

      Vitest.expect(reply).toBe('dispatched reply');
      Vitest.expect(fake.runs).toHaveLength(1);
      Vitest.expect(fake.runs[0]?.text).toContain('spec-one');
      Vitest.expect(fake.runs[0]?.text).not.toContain('spec-two');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('rejects an unknown mode and never dispatches', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login'));
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      const failure = yield* runTool(tool, { name: 'ship-login', mode: 'supervised' }).pipe(
        Effect.flip,
      );

      Vitest.expect(failure).toContain('code     prompt.mode');
      Vitest.expect(failure).toContain('expected one of guided, autonomous');
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a padded phase instead of trimming it into a valid id', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login'));
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      for (const phase of [' A ', 'A ', '\tA']) {
        const failure = yield* runTool(tool, { name: 'ship-login', phase }).pipe(Effect.flip);
        Vitest.expect(failure, JSON.stringify(phase)).toContain('code     cli.invalid-argument');
        Vitest.expect(failure, JSON.stringify(phase)).toContain('field    --phase');
        Vitest.expect(failure, JSON.stringify(phase)).toContain(
          'next     mf-specs execute --name <spec> --phase <id>',
        );
      }
      // The name flag follows the same rule as the phase flag.
      for (const name of [' ship-login ', '..', 'A', '']) {
        const failure = yield* runTool(tool, { name }).pipe(Effect.flip);
        Vitest.expect(failure, JSON.stringify(name)).toContain('code     cli.invalid-argument');
        Vitest.expect(failure, JSON.stringify(name)).toContain('field    --name');
        Vitest.expect(failure, JSON.stringify(name)).toContain(
          'next     mf-specs execute --name <spec>',
        );
      }
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('treats a blank phase as absent and dispatches the active phase', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login'));
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      yield* runTool(tool, { name: 'ship-login', phase: '   ', model: 'fixture/model' });

      const run = fake.runs[0];
      Vitest.expect(run?.text).not.toContain('Work only phase');
      Vitest.expect(run?.text).toContain('phase A');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses to dispatch without a model or a host default', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', phaseA('ship-login'));
      yield* preparePrompts(work);
      const fake = recorder();

      const tool = specExecuteTool(options(work, { execute: fake.execute }));
      const failure = yield* runTool(tool, { name: 'ship-login' }).pipe(Effect.flip);

      Vitest.expect(failure).toContain('No model selected');
      Vitest.expect(failure).toContain('provider/model-id');
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );
});

Vitest.describe('spec_sizing tool', () => {
  Vitest.it.effect('decodes the documented input', () =>
    Effect.gen(function* () {
      const decoded = yield* Schema.decodeUnknownEffect(SpecSizingInput)({
        scope: 'phase',
        name: 'ship-login',
        phase: 'A',
        focus: 'Prefer cheap models',
        mode: 'autonomous',
        model: 'fixture/model',
      });
      Vitest.expect(decoded.scope).toBe('phase');
      Vitest.expect(decoded.phase).toBe('A');
      Vitest.expect(decoded.mode).toBe('autonomous');

      const open = yield* Schema.decodeUnknownEffect(SpecSizingInput)({});
      Vitest.expect(open.scope).toBeUndefined();
    }),
  );

  Vitest.it.effect('renders the open scope and dispatches it through the shared executor', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* prepareSizingPrompts(work);
      const fake = recorder();

      const tool = specSizingTool(
        options(work, {
          execute: fake.execute,
          defaultModel: () => Effect.succeed('fixture/default'),
        }),
      );
      const reply = yield* runTool(tool, {});

      Vitest.expect(reply).toBe('dispatched reply');
      Vitest.expect(fake.runs).toHaveLength(1);
      const run = fake.runs[0];
      Vitest.expect(run?.name).toBe('spec-sizing');
      Vitest.expect(run?.model).toBe('fixture/default');
      Vitest.expect(run?.cwd).toBe(work.dir);
      Vitest.expect(run?.text).toContain('Scope is open: no layer is selected.');
      Vitest.expect(run?.skills).toStrictEqual([
        'executing-skills',
        'montflow-find-specs',
        'montflow-create-specs',
        'grilling',
        'i-have-adhd',
      ]);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('derives phase scope, carries focus, and renders the autonomous branch', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* prepareSizingPrompts(work);
      const fake = recorder();

      const tool = specSizingTool(options(work, { execute: fake.execute }));
      yield* runTool(tool, {
        name: 'ship-login',
        phase: 'A',
        focus: 'Prefer cheap models',
        mode: 'autonomous',
        model: 'fixture/explicit',
      });

      const run = fake.runs[0];
      Vitest.expect(run?.text).toContain('`phases.A.sizes` inside `ship-login/sizing.json`');
      Vitest.expect(run?.text).toContain('Autonomous run: decide the scope');
      Vitest.expect(run?.text).toContain('Steer this run with this focus: Prefer cheap models');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('renders the same prompt text as the binary engine', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* prepareSizingPrompts(work);
      const fake = recorder();

      const tool = specSizingTool(options(work, { execute: fake.execute }));
      yield* runTool(tool, { name: 'ship-login', phase: 'A', model: 'fixture/model' });

      const engine = yield* sizingConfig(work.dir, { name: 'ship-login', phase: 'A' }).pipe(
        Effect.provide(Layer.provide(PromptStore.Default, Platform)),
      );
      Vitest.expect(fake.runs[0]?.text).toBe(engine.prompt.text);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('rejects a contradictory scope without dispatching', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* prepareSizingPrompts(work);
      const fake = recorder();

      const tool = specSizingTool(options(work, { execute: fake.execute }));
      const failure = yield* runTool(tool, { phase: 'A', model: 'fixture/model' }).pipe(
        Effect.flip,
      );

      Vitest.expect(failure).toContain('code     cli.invalid-argument');
      Vitest.expect(failure).toContain('--phase requires --name');
      Vitest.expect(failure).toContain('mf-specs sizing-config --name <spec> --phase A');
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a padded phase as supplied, the same rule the binary applies', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* prepareSizingPrompts(work);
      const fake = recorder();

      const tool = specSizingTool(options(work, { execute: fake.execute }));
      for (const phase of [' A ', 'A ', '\tA']) {
        const failure = yield* runTool(tool, {
          name: 'ship-login',
          phase,
          model: 'fixture/model',
        }).pipe(Effect.flip);
        Vitest.expect(failure, JSON.stringify(phase)).toContain('code     cli.invalid-argument');
        Vitest.expect(failure, JSON.stringify(phase)).toContain('field    --phase');
        Vitest.expect(failure, JSON.stringify(phase)).toContain(
          'next     mf-specs sizing-config --name <spec> --phase <id>',
        );
      }
      // A blank phase is still "absent" for the same tool.
      yield* runTool(tool, { name: 'ship-login', phase: '   ', model: 'fixture/model' });
      Vitest.expect(fake.runs).toHaveLength(1);
      Vitest.expect(fake.runs[0]?.text).toContain('`ship-login/sizing.json`');

      // A padded name is refused with the binary's name rule, not trimmed.
      const paddedName = yield* runTool(tool, {
        name: ' ship-login ',
        model: 'fixture/model',
      }).pipe(Effect.flip);
      Vitest.expect(paddedName).toContain('code     cli.invalid-argument');
      Vitest.expect(paddedName).toContain('field    --name');
      Vitest.expect(paddedName).toContain('next     mf-specs sizing-config --name <spec>');
      Vitest.expect(fake.runs).toHaveLength(1);
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('returns the doctor diagnostic instead of dispatching on a missing prompt', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const fake = recorder();
      const tool = specSizingTool(options(work, { execute: fake.execute }));

      const failure = yield* runTool(tool, { scope: 'repo', model: 'fixture/model' }).pipe(
        Effect.flip,
      );
      Vitest.expect(failure).toContain('code     prompt.missing');
      Vitest.expect(failure).toContain('spec-sizing.json');
      Vitest.expect(failure).toContain('fix      Run mf-specs doctor');
      Vitest.expect(fake.runs).toHaveLength(0);
    }).pipe(Effect.provide(Platform)),
  );
});

/** The real store plus the platform services both catalogue actions need. */
const Store = Layer.merge(Layer.provide(SpecStore.Default, Platform), Platform);

const catalogueSource: Catalogue.ModelSource = {
  list: () =>
    Effect.succeed([
      { providerID: 'fixture', modelID: 'known', variants: ['low', 'high'] },
      { providerID: 'fixture', modelID: 'unknown', variants: null },
    ]),
  default: () => Effect.succeed({ providerID: 'fixture', modelID: 'known' }),
};

Vitest.describe('spec_models tool', () => {
  Vitest.it.effect('decodes list and verify and rejects an invented action', () =>
    Effect.gen(function* () {
      const listed = yield* Schema.decodeUnknownEffect(SpecModelsInput)({ action: 'list' });
      Vitest.expect(listed.action).toBe('list');
      const verified = yield* Schema.decodeUnknownEffect(SpecModelsInput)({
        action: 'verify',
        name: 'ship-login',
      });
      Vitest.expect(verified.name).toBe('ship-login');
      const failure = yield* Schema.decodeUnknownEffect(SpecModelsInput)({ action: 'invent' }).pipe(
        Effect.flip,
      );
      Vitest.expect(String(failure)).toContain('action');
    }),
  );

  Vitest.it.effect('list returns the same JSON document as the binary', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const tool = specModelsTool({ cwd: work.dir, model: catalogueSource });
      const reply = yield* runTool(tool, { action: 'list' });
      const binary = yield* listModels({ json: true }, catalogueSource).pipe(
        Effect.provide(Platform),
      );
      Vitest.expect(reply).toBe(binary.output);
      Vitest.expect(reply).toContain('"default": "fixture/known"');
      Vitest.expect(reply).toContain('"variants": null');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('verify returns the same findings as the binary', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      yield* seed(work, 'ship-login', [
        ...phaseA('ship-login'),
        [
          'sizing.json',
          JSON.stringify({
            sizes: {
              tiny: { model: 'fixture/known', effort: 'ultra' },
              small: { model: 'fixture/ghost' },
            },
          }),
        ] as const,
      ]);
      const tool = specModelsTool({ cwd: work.dir, model: catalogueSource });
      const reply = yield* runTool(tool, { action: 'verify', name: 'ship-login' });
      const binary = yield* verifyModels(
        work.path.join(work.dir, DEFAULT_ROOT),
        { name: 'ship-login' },
        catalogueSource,
      ).pipe(Effect.provide(Store));
      Vitest.expect(reply).toBe(binary.output);
      Vitest.expect(reply).toContain('code     ! models.unknown-model');
      Vitest.expect(reply).toContain('code     ! models.unknown-effort');
      Vitest.expect(reply).toContain('2 entries checked');
      Vitest.expect(reply).toContain('spec 2 checked, 0 skipped');
    }).pipe(Effect.provide(Store)),
  );

  Vitest.it.effect('list without a host model source is models.unavailable', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const tool = specModelsTool({ cwd: work.dir });
      const failure = yield* runTool(tool, { action: 'list' }).pipe(Effect.flip);
      Vitest.expect(failure).toContain('code     models.unavailable');
      Vitest.expect(failure).toContain('--catalog');
    }).pipe(Effect.provide(Platform)),
  );

  Vitest.it.effect('refuses a name on list with exactly the diagnostic the binary prints', () =>
    Effect.gen(function* () {
      const work = yield* prepare;
      const tool = specModelsTool({ cwd: work.dir, model: catalogueSource });
      const root = work.path.join(work.dir, DEFAULT_ROOT);
      for (const name of ['ship-login', '..', 'a/b']) {
        const failure = yield* runTool(tool, { action: 'list', name }).pipe(Effect.flip);
        const binary = yield* models(root, { name }, catalogueSource).pipe(
          Effect.provide(Store),
          Effect.flip,
        );
        const binaryText = diagnoseCause(Cause.fail(binary), {
          path: root,
          rerun: 'mf-specs models',
          verbose: false,
        }).output;
        // The tool returns the catalogue JSON today; it must return the CLI's
        // usage refusal instead, byte for byte.
        Vitest.expect(failure, name).toBe(binaryText);
        Vitest.expect(failure, name).toContain('code     cli.invalid-argument');
        Vitest.expect(failure, name).toContain('field    --name');
        Vitest.expect(failure, name).toContain('--name has no meaning without --verify');
        Vitest.expect(failure, name).not.toContain('"models"');
      }
      // A blank name means "no name", exactly as on the CLI listing path.
      const blank = yield* runTool(tool, { action: 'list', name: '   ' });
      Vitest.expect(blank).toContain('"default": "fixture/known"');
    }).pipe(Effect.provide(Platform)),
  );
});
