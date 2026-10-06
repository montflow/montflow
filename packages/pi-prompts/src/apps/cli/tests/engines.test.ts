import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Engines from '../engines.apps.module.js';
import * as Renderers from '../renderers.apps.module.js';
import * as Doctor from '../../doctor/index.js';
import { PromptStore } from '../../../services/index.js';
import * as Prompts from '../../../modules/prompts/index.js';

/**
 * Engines and renderers are the shared core both front ends sit on, so these
 * tests are about the two things a front end could otherwise get wrong: the
 * engines must not leak UI or argv, and the renderers must honour the token
 * contract.
 */

/** The node services the store layer needs. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** The file-backed store, so engine tests exercise the real filesystem path. */
const Live = Layer.provide(PromptStore.Default, NodeLive);

/** A throwaway repo root with the shipped skills installed, so gates pass. */
const readyRoot = Effect.gen(function* () {
  const root = yield* Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-prompts-eng-')));
  yield* Doctor.runDoctor(root);
  return root;
});

/** A repo root with no installed skills, for gate cases. */
const bareRoot = Effect.promise(() => mkdtemp(join(tmpdir(), 'mf-prompts-eng-bare-')));

const cleanup = (root: string): Effect.Effect<void> =>
  Effect.promise(() => rm(root, { recursive: true, force: true }));

/** The on-disk shape of a prompt file, as a test writes it. */
interface PromptFileFields {
  readonly name: string;
  readonly description: string;
  readonly template: string;
  readonly variables: ReadonlyArray<{ readonly name: string; readonly required?: boolean }>;
  readonly skills: ReadonlyArray<string>;
  readonly model: string;
}

/** Write one prompt file into a repo root. */
const writePrompt = (root: string, file: string, prompt: PromptFileFields): Effect.Effect<void> =>
  Effect.gen(function* () {
    const dir = join(root, '.agents', '@montflow', 'pi-prompts');
    yield* Effect.promise(() => mkdir(dir, { recursive: true }));
    yield* Effect.promise(() =>
      writeFile(join(dir, file), `${JSON.stringify(prompt, null, 2)}\n`, 'utf8'),
    );
  });

/** A prompt with one required and one optional variable, declared explicitly. */
const auditPrompt = (): Prompts.Prompt =>
  Prompts.make(
    'audit',
    'Audit {{files}}{{#if scope}} in {{scope}}{{else}} everywhere{{/if}}',
    'Audits.',
    '',
    [
      Prompts.requiredVariable('files'),
      new Prompts.Variable({
        name: 'scope',
        label: 'scope',
        description: '',
        type: 'text',
        required: false,
        default: '',
      }),
    ],
  );

Vitest.describe('Engines.keyValues', () => {
  Vitest.it('collects bare, --set, and --set= forms', () => {
    Vitest.expect(Engines.keyValues(['a=1', '--set', 'b=2', '--set=c=3'])).toStrictEqual({
      a: '1',
      b: '2',
      c: '3',
    });
  });

  Vitest.it('keeps an empty value rather than dropping it', () => {
    Vitest.expect(Engines.keyValues(['a='])).toStrictEqual({ a: '' });
  });

  Vitest.it('lets the first occurrence win, so a later token cannot shadow it', () => {
    Vitest.expect(Engines.keyValues(['a=1', 'a=2'])).toStrictEqual({ a: '1' });
  });

  Vitest.it('keeps spaces after the first =', () => {
    Vitest.expect(Engines.keyValues(['a=one two'])).toStrictEqual({ a: 'one two' });
  });
});

Vitest.describe('Engines.parseVariableSpec', () => {
  Vitest.it('defaults a bare name to required with no default', () => {
    Vitest.expect(Engines.parseVariableSpec('files').pipe(Effect.runSync)).toMatchObject({
      name: 'files',
      label: 'files',
      required: true,
      default: '',
    });
  });

  Vitest.it('reads o as optional', () => {
    Vitest.expect(Engines.parseVariableSpec('x:o').pipe(Effect.runSync)).toMatchObject({
      required: false,
    });
  });

  Vitest.it('reads d= as a default, which also makes the variable optional', () => {
    Vitest.expect(Engines.parseVariableSpec('x:d=v').pipe(Effect.runSync)).toMatchObject({
      required: false,
      default: 'v',
    });
  });

  Vitest.it('accepts the flags in either order', () => {
    Vitest.expect(Engines.parseVariableSpec('x:od=v').pipe(Effect.runSync)).toMatchObject({
      required: false,
      default: 'v',
    });
  });

  Vitest.it('rejects a name that is not a legal flat segment', () => {
    Vitest.expect(Engines.parseVariableSpec('my-var').pipe(Effect.runSyncExit)).toMatchObject({
      _tag: 'Failure',
    });
  });
});

Vitest.describe('Renderers.list', () => {
  const prompt = auditPrompt();

  Vitest.it('prints names only by default', () => {
    Vitest.expect(Renderers.list([prompt])).toBe('audit');
  });

  Vitest.it('adds description, model, and a variable count when verbose', () => {
    const text = Renderers.list([prompt], { verbose: true });
    Vitest.expect(text).toContain('Audits.');
    Vitest.expect(text).toContain('model: (none)');
    Vitest.expect(text).toContain('variables: 2 (1 required)');
  });

  Vitest.it('hints at the create command when the store is empty', () => {
    Vitest.expect(Renderers.list([])).toContain('mf-prompts create');
  });

  Vitest.it('keeps every lean line present in a verbose run', () => {
    const prompts = [prompt, Prompts.make('other', 'Other.', 'Another.')];
    const lean = Renderers.list(prompts).split('\n');
    const verbose = Renderers.list(prompts, { verbose: true });
    for (const line of lean) Vitest.expect(verbose).toContain(line);
  });
});

Vitest.describe('Renderers.verify', () => {
  const ok = { valid: true, issues: [] } as const;

  Vitest.it('confirms a clean file in one line', () => {
    Vitest.expect(Renderers.verify('audit', ok)).toBe("✓ 'audit' matches the standard format.");
  });

  Vitest.it('adds the checked path only when verbose', () => {
    Vitest.expect(Renderers.verify('audit', ok, { verbose: true })).toContain('audit.json');
    Vitest.expect(Renderers.verify('audit', ok, { verbose: false })).not.toContain('audit.json');
  });

  Vitest.it('never withholds an issue, in either mode', () => {
    const bad = { valid: false, issues: [{ field: 'template' as const, message: 'Bad.' }] };
    for (const verbose of [false, true]) {
      Vitest.expect(Renderers.verify('audit', bad, { verbose })).toContain('Bad.');
    }
  });
});

Vitest.describe('Renderers', () => {
  Vitest.it('emits no ANSI escapes, since agents read this verbatim', () => {
    const text = Renderers.list([auditPrompt()], { verbose: true });
    // oxlint-disable-next-line no-control-regex -- asserting the absence of escapes is the point.
    Vitest.expect(/\[/u.test(text)).toBe(false);
  });

  Vitest.it('uses the caller invocation in the gate message', () => {
    const result: Doctor.DoctorResult = {
      status: 'drifted',
      healthy: false,
      message: '',
      skills: [{ name: 'a', status: 'missing', source: '', target: '', detail: 'not installed' }],
    };
    Vitest.expect(Renderers.gate(result)).toContain('/mf-prompts doctor');
    Vitest.expect(Renderers.gate(result, 'mf-prompts doctor')).toContain('mf-prompts doctor');
  });
});

Vitest.describe('Engines over the store', () => {
  const seed = (root: string): Effect.Effect<void> =>
    writePrompt(root, 'audit.json', {
      name: 'audit',
      description: 'Audits.',
      template: 'Audit {{files}}{{#if scope}} in {{scope}}{{else}} everywhere{{/if}}',
      variables: [{ name: 'files' }, { name: 'scope', required: false }],
      skills: [],
      model: '',
    });

  Vitest.it.effect('lists, loads, verifies, and renders', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      yield* seed(root);
      const scope = { cwd: root };
      Vitest.expect((yield* Engines.list(scope)).map((entry) => entry.name)).toStrictEqual([
        'audit',
      ]);
      Vitest.expect((yield* Engines.load(scope, 'audit')).description).toBe('Audits.');
      Vitest.expect((yield* Engines.verify(scope, 'audit')).valid).toBe(true);
      Vitest.expect(yield* Engines.render(scope, 'audit', { files: 'src/' })).toContain(
        'everywhere',
      );
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('renders the then branch when the optional value is supplied', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      yield* seed(root);
      const text = yield* Engines.render({ cwd: root }, 'audit', { files: 'src/', scope: 'core' });
      Vitest.expect(text).toContain('in core');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('refuses to render with a required value missing', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      yield* seed(root);
      const error = yield* Engines.render({ cwd: root }, 'audit', {}).pipe(Effect.flip);
      Vitest.expect(error).toContain('files');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('fails with a slug hint for an invalid name', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      const error = yield* Engines.load({ cwd: root }, 'Bad Name').pipe(Effect.flip);
      Vitest.expect(error).toContain('kebab-case slug');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('fails with a list hint for an unknown name', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      const error = yield* Engines.load({ cwd: root }, 'nope').pipe(Effect.flip);
      Vitest.expect(error).toContain('Unknown prompt');
      Vitest.expect(error).toContain('list');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('round-trips create then modify, keeping absent fields', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      const created = yield* Engines.create({
        cwd: root,
        name: 'note',
        template: 'Note about {{topic}}',
        description: 'A note.',
        variables: ['topic'],
      });
      Vitest.expect(created.variables.map((entry) => entry.name)).toStrictEqual(['topic']);
      const updated = yield* Engines.modify({
        cwd: root,
        name: 'note',
        template: 'Note: {{topic}}',
      });
      // `description` was not passed, so the stored value must survive.
      Vitest.expect(updated.description).toBe('A note.');
      Vitest.expect(updated.template).toBe('Note: {{topic}}');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('rejects a create with an invalid name or empty template', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      const badName = yield* Engines.create({
        cwd: root,
        name: 'Bad Name',
        template: 'x',
      }).pipe(Effect.flip);
      Vitest.expect(badName).toContain('kebab-case');
      const blank = yield* Engines.create({ cwd: root, name: 'ok', template: '  ' }).pipe(
        Effect.flip,
      );
      Vitest.expect(blank).toContain('non-empty');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('blocks execution when the skills are absent, naming the repair', () =>
    Effect.gen(function* () {
      const root = yield* bareRoot;
      yield* seed(root);
      const error = yield* Engines.plan(
        { cwd: root, model: 'p/m', values: { files: 'src/' } },
        'audit',
      ).pipe(Effect.flip);
      Vitest.expect(error).toContain('Prompts skills are not ready');
      Vitest.expect(error).toContain('/mf-prompts doctor');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );

  Vitest.it.effect('threads the caller invocation into a refusal', () =>
    Effect.gen(function* () {
      const root = yield* readyRoot;
      yield* seed(root);
      const blocked = yield* Engines.plan(
        { cwd: root, model: 'p/m', invocation: 'mf-prompts execute' },
        'audit',
      );
      Vitest.expect(blocked.ok).toBe(false);
      if (blocked.ok) return yield* cleanup(root);
      Vitest.expect(blocked.message).toContain("mf-prompts execute 'audit'");
      Vitest.expect(blocked.message).not.toContain('/mf-prompts');
      yield* cleanup(root);
    }).pipe(Effect.provide(Live)),
  );
});
