import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer, Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Cli from '../index.js';
import * as Interactive from '../../interactive/index.js';
import * as Doctor from '../../doctor/index.js';
import * as PromptExecute from '../../../modules/prompt-execute/index.js';
import * as Prompts from '../../../modules/prompts/index.js';
import { PromptStore } from '../../../services/index.js';

/** A prompt file with a required and an optional variable. */
const promptRaw = JSON.stringify({
  name: 'commit-message',
  description: 'Draft a commit message.',
  template:
    'Draft a message for {{files}}.\n{{#if scope}}Scope: {{scope}}{{else}}Scope: all.{{/if}}',
  variables: [{ name: 'files' }, { name: 'scope', required: false }],
  skills: [],
  model: '',
});

/** The same prompt, pinned to a model. */
const pinnedRaw = JSON.stringify({
  name: 'commit-message',
  description: 'Draft a commit message.',
  template: 'Draft a message for {{files}}.',
  variables: [{ name: 'files' }],
  skills: [],
  model: 'pinned/model',
});

/** Stub store serving the given prompt files by name. */
const stubLayer = (files: Readonly<Record<string, string>>): Layer.Layer<PromptStore.PromptStore> =>
  Layer.succeed(
    PromptStore.PromptStore,
    PromptStore.PromptStore.of({
      list: () => Effect.succeed(Object.entries(files).map(([name, raw]) => decode(raw, name))),
      remove: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
      save: () => Effect.fail(new PromptStore.StoreError({ message: 'unused' })),
      readRaw: (_cwd: string, name: string) => {
        const raw = files[name];
        return raw === undefined
          ? Effect.fail(new PromptStore.StoreError({ message: `Unknown prompt '${name}'.` }))
          : Effect.succeed(raw);
      },
    }),
  );

/** Decode one raw prompt file through the real schema. */
const decode = (raw: string, name: string): Prompts.Prompt => {
  try {
    // SAFETY: `JSON.parse` returns `any`; narrowing to `unknown` hands the
    // value to the `Prompt` schema, which is what validates it.
    return Schema.decodeUnknownSync(Prompts.Prompt)(JSON.parse(raw) as unknown);
  } catch {
    throw new Error(`test fixture '${name}' is not a valid prompt file`);
  }
};

/**
 * A repo root with the shipped skills installed, so the `execute` doctor gate
 * passes. Most cases need that; the gate itself has its own cases below.
 */
const readyRoot = (): Promise<string> =>
  Effect.gen(function* () {
    const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-prompts-scratch-')));
    yield* Doctor.runDoctor(root);
    return root;
  }).pipe(Effect.runPromise);

/** A repo root with no `.agents/skills/` at all. */
const bareRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-prompts-bare-'));

const cleanup = (root: string): Effect.Effect<void> =>
  Effect.promise(() => rm(root, { recursive: true, force: true }));

/** Notify-only UI: dialogs reject so any prompt attempt fails the test. */
const scriptedUi = (notifies: Array<string>): Interactive.InteractiveUi => ({
  select: () => Promise.reject(new Error('CLI must not prompt')),
  confirm: () => Promise.reject(new Error('CLI must not prompt')),
  input: () => Promise.reject(new Error('CLI must not prompt')),
  notify: (message) => {
    notifies.push(message);
  },
});

/** Executor that records what it was handed and replies with a marker. */
const recordingExecutor =
  (seen: Array<PromptExecute.ExecutionRequest>): PromptExecute.PromptExecutor =>
  (request) =>
    Effect.sync(() => {
      seen.push(request);
      return 'agent replied';
    });

Vitest.describe('Cli.parseCliArgs execute and inspect', () => {
  Vitest.it('parses execute with a model and values', () => {
    Vitest.expect(Cli.parseCliArgs('execute commit --model p/m files=src scope=x')).toStrictEqual({
      kind: 'Execute',
      name: 'commit',
      model: 'p/m',
      values: { files: 'src', scope: 'x' },
    });
  });

  Vitest.it('parses execute with no model, leaving it undefined', () => {
    Vitest.expect(Cli.parseCliArgs('execute commit files=src')).toMatchObject({
      kind: 'Execute',
      model: undefined,
      values: { files: 'src' },
    });
  });

  Vitest.it('parses --model=value as well as --model value', () => {
    Vitest.expect(Cli.parseCliArgs('execute commit --model=p/m files=src')).toMatchObject({
      model: 'p/m',
    });
  });

  Vitest.it('falls back to Help for execute with no name', () => {
    Vitest.expect(Cli.parseCliArgs('execute')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('falls back to Help for an unknown execute flag', () => {
    Vitest.expect(Cli.parseCliArgs('execute commit --nope x')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('parses inspect with values', () => {
    Vitest.expect(Cli.parseCliArgs('inspect commit files=src')).toStrictEqual({
      kind: 'Inspect',
      name: 'commit',
      values: { files: 'src' },
    });
  });

  Vitest.it('falls back to Help for inspect with no name', () => {
    Vitest.expect(Cli.parseCliArgs('inspect')).toStrictEqual({ kind: 'Help' });
  });

  Vitest.it('parses doctor with and without --check', () => {
    Vitest.expect(Cli.parseCliArgs('doctor')).toStrictEqual({ kind: 'Doctor', check: false });
    Vitest.expect(Cli.parseCliArgs('doctor --check')).toStrictEqual({
      kind: 'Doctor',
      check: true,
    });
  });

  Vitest.it('falls back to Help for an unknown doctor flag', () => {
    Vitest.expect(Cli.parseCliArgs('doctor --nope')).toStrictEqual({ kind: 'Help' });
  });
});

Vitest.describe('Cli.run inspect', () => {
  Vitest.it.effect('notifies a table of the variables and their effective values', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'inspect commit-message files=src/',
        scriptedUi(notifies),
        root,
        recordingExecutor([]),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(notifies.length).toBe(1);
      const table = notifies[0] ?? '';
      Vitest.expect(table).toContain('commit-message — Draft a commit message.');
      Vitest.expect(table).toContain('NAME');
      Vitest.expect(table).toContain('files');
      Vitest.expect(table).toContain('src/');
      Vitest.expect(table).toContain('1 required, 1 optional');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('names the required values that are still missing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'inspect commit-message',
        scriptedUi(notifies),
        root,
        recordingExecutor([]),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(notifies[0]).toContain('Missing required values: files');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails for an unknown prompt', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const error = yield* Cli.run(
        'inspect nope',
        scriptedUi([]),
        root,
        recordingExecutor([]),
      ).pipe(Effect.provide(stubLayer({})), Effect.flip);
      Vitest.expect(error).toContain("Unknown prompt 'nope'");
      yield* cleanup(root);
    }),
  );
});

Vitest.describe('Cli.run execute', () => {
  Vitest.it.effect('runs the prompt on the given model and notifies the reply', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      const seen: Array<PromptExecute.ExecutionRequest> = [];
      yield* Cli.run(
        'execute commit-message --model p/m files=src/',
        scriptedUi(notifies),
        root,
        recordingExecutor(seen),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(seen.length).toBe(1);
      Vitest.expect(seen[0]?.model).toBe('p/m');
      Vitest.expect(seen[0]?.name).toBe('commit-message');
      // The optional scope is unanswered, so the else branch is what runs.
      Vitest.expect(seen[0]?.text).toContain('Scope: all.');
      Vitest.expect(notifies).toStrictEqual(['agent replied']);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('takes the then branch when the optional value is supplied', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const seen: Array<PromptExecute.ExecutionRequest> = [];
      yield* Cli.run(
        'execute commit-message --model p/m files=src scope=packages/core',
        scriptedUi([]),
        root,
        recordingExecutor(seen),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(seen[0]?.text).toContain('Scope: packages/core');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails with the model message when neither caller nor prompt pins one', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const error = yield* Cli.run(
        'execute commit-message files=src',
        scriptedUi([]),
        root,
        recordingExecutor([]),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })), Effect.flip);
      Vitest.expect(error).toContain('has no model');
      Vitest.expect(error).toContain('--model provider/model-id');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('runs on the prompt pinned model when the caller passes none', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const seen: Array<PromptExecute.ExecutionRequest> = [];
      yield* Cli.run(
        'execute commit-message files=src',
        scriptedUi([]),
        root,
        recordingExecutor(seen),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': pinnedRaw })));
      Vitest.expect(seen[0]?.model).toBe('pinned/model');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails with the variables message, naming each gap and the fix', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const seen: Array<PromptExecute.ExecutionRequest> = [];
      const error = yield* Cli.run(
        'execute commit-message --model p/m',
        scriptedUi([]),
        root,
        recordingExecutor(seen),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })), Effect.flip);
      Vitest.expect(seen).toStrictEqual([]);
      Vitest.expect(error).toContain('needs 1 required value.');
      Vitest.expect(error).toContain('files=<value>');
      Vitest.expect(error).toContain('"required": false');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('stops at the doctor gate, before any run, when skills are absent', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(bareRoot);
      const seen: Array<PromptExecute.ExecutionRequest> = [];
      const error = yield* Cli.run(
        'execute commit-message --model p/m files=src',
        scriptedUi([]),
        root,
        recordingExecutor(seen),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })), Effect.flip);
      Vitest.expect(seen).toStrictEqual([]);
      Vitest.expect(error).toContain('Prompts skills are not ready');
      Vitest.expect(error).toContain(Doctor.SKILL_NAMES[0]);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('stops at the doctor gate when an installed skill has drifted', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      yield* Effect.promise(() =>
        writeFile(
          join(root, '.agents', 'skills', Doctor.SKILL_NAMES[0], 'SKILL.md'),
          'out of date\n',
          'utf8',
        ),
      );
      const seen: Array<PromptExecute.ExecutionRequest> = [];
      const error = yield* Cli.run(
        'execute commit-message --model p/m files=src',
        scriptedUi([]),
        root,
        recordingExecutor(seen),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })), Effect.flip);
      Vitest.expect(seen).toStrictEqual([]);
      Vitest.expect(error).toContain('differs from the packaged version');
      yield* cleanup(root);
    }),
  );
});

Vitest.describe('Cli.run doctor', () => {
  Vitest.it.effect('fails with the gate message in check mode on a bare repo', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(bareRoot);
      const notifies: Array<string> = [];
      const error = yield* Cli.run(
        'doctor --check',
        scriptedUi(notifies),
        root,
        recordingExecutor([]),
      ).pipe(Effect.provide(stubLayer({})), Effect.flip);
      Vitest.expect(notifies[0]).toContain('not usable');
      Vitest.expect(error).toContain('Prompts skills are not ready');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('repairs and succeeds without --check', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(bareRoot);
      const notifies: Array<string> = [];
      yield* Cli.run('doctor', scriptedUi(notifies), root, recordingExecutor([])).pipe(
        Effect.provide(stubLayer({})),
      );
      Vitest.expect(notifies[0]).toContain('repaired');
      yield* cleanup(root);
    }),
  );
});
