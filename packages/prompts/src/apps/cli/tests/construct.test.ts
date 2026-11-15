import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer, Schema } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Cli from '../index.js';
import * as Interactive from '../../interactive/index.js';
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

/** The same prompt, pinned to a model (construct must not care). */
const pinnedRaw = JSON.stringify({
  name: 'commit-message',
  description: 'Draft a commit message.',
  template: 'Draft a message for {{files}}.',
  variables: [{ name: 'files' }],
  skills: [],
  model: 'pinned/model',
});

/** A conditional prompt: isolation controls whether origin exists. */
const branchRaw = JSON.stringify({
  name: 'branch',
  description: 'Pick a branch.',
  template: 'Isolated: {{isolated}}.{{#if origin}} Origin: {{origin}}.{{else}} No origin.{{/if}}',
  variables: [
    { name: 'isolated', type: 'select', options: ['yes', 'no'] },
    {
      name: 'origin',
      type: 'select',
      options: ['current', 'main'],
      when: { controller: 'isolated', equals: 'yes' },
    },
  ],
  skills: [],
  model: 'p/m',
});

/** A confirm controller gating one text child. */
const confirmRaw = JSON.stringify({
  name: 'confirm',
  description: 'Confirm a flag.',
  template: 'Flag: {{flag}}.{{#if child}} Child: {{child}}.{{/if}}',
  variables: [
    { name: 'flag', type: 'confirm' },
    { name: 'child', required: false, when: { controller: 'flag', truthy: true } },
  ],
  skills: [],
  model: 'p/m',
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
      readAllRaw: () => Effect.succeed(Object.entries(files).map(([name, raw]) => ({ name, raw }))),
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

/** A repo root (construct never runs the doctor gate, so a bare root is fine). */
const readyRoot = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-prompts-cli-'));

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

/** Executor port (construct never runs an agent; kept for the run signature). */
const recordingExecutor = (): PromptExecute.PromptExecutor => (request) =>
  Effect.sync(() => `agent replied to ${request.name}`);

Vitest.describe('Cli.parseCliArgs construct and inspect', () => {
  Vitest.it('parses construct with values', () => {
    Vitest.expect(Cli.parseCliArgs('construct commit files=src scope=x')).toStrictEqual({
      kind: 'Construct',
      name: 'commit',
      values: { files: 'src', scope: 'x' },
      wizard: false,
      copy: false,
    });
  });

  Vitest.it('parses construct --wizard with no name', () => {
    Vitest.expect(Cli.parseCliArgs('construct --wizard')).toMatchObject({
      kind: 'Construct',
      name: undefined,
      wizard: true,
    });
  });

  Vitest.it('parses construct --copy', () => {
    Vitest.expect(Cli.parseCliArgs('construct commit files=src --copy')).toMatchObject({
      kind: 'Construct',
      wizard: false,
      copy: true,
    });
  });

  Vitest.it('falls back to Help for an unknown construct flag', () => {
    Vitest.expect(Cli.parseCliArgs('construct commit --model p/m')).toStrictEqual({
      kind: 'Help',
    });
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

  Vitest.it('no longer parses the removed render and execute commands', () => {
    Vitest.expect(Cli.parseCliArgs('render commit files=src')).toStrictEqual({ kind: 'Help' });
    Vitest.expect(Cli.parseCliArgs('execute commit --model p/m files=src')).toStrictEqual({
      kind: 'Help',
    });
  });

  Vitest.it('parses doctor with and without --check', () => {
    Vitest.expect(Cli.parseCliArgs('doctor')).toStrictEqual({ kind: 'Doctor', check: false });
    Vitest.expect(Cli.parseCliArgs('doctor --check')).toStrictEqual({
      kind: 'Doctor',
      check: true,
    });
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
        recordingExecutor(),
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
});

Vitest.describe('Cli.run construct', () => {
  Vitest.it.effect('constructs a supplied prompt with a required value', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct commit-message files=src/',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      // The optional scope is unanswered, so the else branch is what renders.
      Vitest.expect(notifies[0]).toBe('Draft a message for src/.\nScope: all.');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('constructs a prompt that pins no model', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct commit-message files=src/',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(notifies[0]).toContain('Draft a message for src/');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('constructs the then branch when the optional value is supplied', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct commit-message files=src scope=packages/core',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(notifies[0]).toContain('Scope: packages/core');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('fails with the variables message, naming each gap and the fix', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const error = yield* Cli.run(
        'construct commit-message',
        scriptedUi([]),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })), Effect.flip);
      Vitest.expect(error).toContain('needs 1 required value.');
      Vitest.expect(error).toContain('files=<value>');
      Vitest.expect(error).toContain('"required": false');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('constructs a pinned prompt without ever needing a model', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct commit-message files=src',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': pinnedRaw })));
      Vitest.expect(notifies[0]).toBe('Draft a message for src.');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('--wizard reaches the wizard flow and refuses in a non-TTY', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const error = yield* Cli.run(
        'construct --wizard commit-message',
        scriptedUi([]),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })), Effect.flip);
      Vitest.expect(error).toContain(Interactive.NON_TTY_MESSAGE);
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('--copy constructs and still prints the output', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct commit-message files=src --copy',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ 'commit-message': promptRaw })));
      Vitest.expect(notifies[0]).toContain('Draft a message for src.');
      yield* cleanup(root);
    }),
  );
});

Vitest.describe('Cli.run construct conditional and confirm', () => {
  Vitest.it.effect('constructs the yes path of a conditional prompt', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct branch isolated=yes origin=main',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ branch: branchRaw })));
      Vitest.expect(notifies[0]).toBe('Isolated: yes. Origin: main.');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('ignores a value for a hidden variable when constructing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct branch isolated=no origin=main',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ branch: branchRaw })));
      Vitest.expect(notifies[0]).toBe('Isolated: no. No origin.');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('refuses a select value outside its options when constructing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const error = yield* Cli.run(
        'construct branch isolated=yes origin=maybe',
        scriptedUi([]),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ branch: branchRaw })), Effect.flip);
      Vitest.expect(error).toContain("'maybe'");
      Vitest.expect(error).toContain("'origin'");
      Vitest.expect(error).toContain('select');
      Vitest.expect(error).toContain('current, main');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('constructs the yes path and gates the dependent confirm', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct confirm flag=yes child=extra',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ confirm: confirmRaw })));
      Vitest.expect(notifies[0]).toBe('Flag: yes. Child: extra.');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('accepts an unchecked confirm as the empty answer', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const notifies: Array<string> = [];
      yield* Cli.run(
        'construct confirm flag=',
        scriptedUi(notifies),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ confirm: confirmRaw })));
      Vitest.expect(notifies[0]).toBe('Flag: .');
      yield* cleanup(root);
    }),
  );

  Vitest.it.effect('refuses any other confirm value when constructing', () =>
    Effect.gen(function* () {
      const root = yield* Effect.promise(readyRoot);
      const error = yield* Cli.run(
        'construct confirm flag=no',
        scriptedUi([]),
        root,
        recordingExecutor(),
      ).pipe(Effect.provide(stubLayer({ confirm: confirmRaw })), Effect.flip);
      Vitest.expect(error).toContain("'no'");
      Vitest.expect(error).toContain("'flag'");
      Vitest.expect(error).toContain('confirm');
      Vitest.expect(error).toContain("'yes'");
      yield* cleanup(root);
    }),
  );
});
