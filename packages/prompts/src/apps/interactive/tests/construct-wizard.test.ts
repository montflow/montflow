import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { ProfileStore } from '@montflow/profiles';
import { Effect, Layer } from 'effect';
import * as Vitest from '@effect/vitest';
import * as Interactive from '../index.js';
import * as Prompts from '../../../modules/prompts/index.js';
import { PromptStore } from '../../../services/index.js';

/** Node layers shared by the file-backed stores. */
const NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer);

/** Both stores the wizard reads, provided for tests. */
const Live = Layer.mergeAll(
  Layer.provide(PromptStore.Default, NodeLive),
  Layer.provide(ProfileStore.Default, NodeLive),
);

/** A variable with every field resolved. */
const variable = (
  name: string,
  rest: Partial<{
    required: boolean;
    default: string;
    label: string;
    type: 'text' | 'textarea' | 'select' | 'confirm';
    options: ReadonlyArray<string>;
    when: Prompts.VariableCondition;
  }> = {},
): Prompts.Variable => {
  const base = {
    name,
    label: rest.label ?? name,
    description: '',
    type: rest.type ?? 'text',
    required: rest.required ?? true,
    default: rest.default ?? '',
  };
  const withOptions = rest.options === undefined ? base : { ...base, options: [...rest.options] };
  const withWhen = rest.when === undefined ? withOptions : { ...withOptions, when: rest.when };
  return new Prompts.Variable(withWhen);
};

/** A temporary workspace root. */
const root = (): Promise<string> => mkdtemp(join(tmpdir(), 'mf-wizard-'));

/** Write one prompt into the store under `cwd`. */
const writePrompt = async (cwd: string, prompt: Prompts.Prompt): Promise<void> => {
  const dir = join(cwd, '.agents', '@montflow', 'prompts');
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${prompt.name}.json`), JSON.stringify(Prompts.encode(prompt)), 'utf8');
};

/** Write one profile (as a `PROFILE.md`) into the store under `cwd`. */
const writeProfile = async (cwd: string, slug: string, description: string): Promise<void> => {
  const dir = join(cwd, '.agents', '@montflow', 'profiles', slug);
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'PROFILE.md'),
    `---\nname: ${slug}\ndescription: ${description}\nmodel: ''\nskills: []\n---\n`,
    'utf8',
  );
};

/** One scripted dialog answer, in the order the dialogs are opened. */
interface Script {
  /** Answers for `select`, in order. */
  readonly selects?: readonly (string | undefined)[];
  /** Answers for `input`, in order. */
  readonly inputs?: readonly string[];
}

/** A scripted UI plus what it was asked. */
interface ScriptedUi {
  readonly ui: Interactive.InteractiveUi;
  readonly asked: Array<string>;
  readonly offered: Array<ReadonlyArray<string>>;
}

/** UI stub that answers each prompt in turn and records what was asked. */
const scriptedUi = (script: Script = {}): ScriptedUi => {
  const asked: Array<string> = [];
  const offered: Array<ReadonlyArray<string>> = [];
  const selects = [...(script.selects ?? [])];
  const inputs = [...(script.inputs ?? [])];
  return {
    asked,
    offered,
    ui: {
      select: (title: string, options: string[]) => {
        asked.push(title);
        offered.push([...options]);
        return Promise.resolve(selects.shift());
      },
      confirm: () => Promise.reject(new Error('confirm must not be called')),
      input: (title: string) => {
        asked.push(title);
        return Promise.resolve(inputs.shift());
      },
      notify: () => undefined,
    },
  };
};

/** Provide the wizard's stores, scoped for the file-backed layers. */
const run = <A, E>(
  effect: Effect.Effect<A, E, PromptStore.PromptStore | ProfileStore.ProfileStore>,
) => effect.pipe(Effect.provide(Live), Effect.scoped);

Vitest.describe('Interactive.constructWizard', () => {
  Vitest.it.effect('shows a prompt picker when no name is given and constructs', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(cwd, Prompts.make('audit', 'Audit everything.', 'Audits the workspace.')),
      );
      const { ui, asked, offered } = scriptedUi({ selects: ['audit'] });
      const text = yield* run(Interactive.constructWizard(ui, cwd, undefined));
      Vitest.expect(asked[0]).toBe('Construct prompt');
      Vitest.expect(offered[0]).toContain('audit');
      Vitest.expect(text).toBe('Audit everything.');
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('renders a select from its declared options', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(
          cwd,
          Prompts.make('audit', 'Mode: {{mode}}', 'Pick a mode.', '', [
            variable('mode', { type: 'select', options: ['a', 'b'] }),
          ]),
        ),
      );
      const { ui, offered } = scriptedUi({ selects: ['a'] });
      const text = yield* run(Interactive.constructWizard(ui, cwd, 'audit'));
      Vitest.expect(offered[0]).toStrictEqual(['a', 'b', '← Back']);
      Vitest.expect(text).toBe('Mode: a');
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('asks a confirm through yes/no choices', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(
          cwd,
          Prompts.make('audit', '{{#if flag}}go{{else}}stop{{/if}}', 'Go or stop.', '', [
            variable('flag', { type: 'confirm', required: false }),
          ]),
        ),
      );
      const { ui, offered } = scriptedUi({ selects: ['no'] });
      const text = yield* run(Interactive.constructWizard(ui, cwd, 'audit'));
      Vitest.expect(offered[0]).toStrictEqual(['yes', 'no', 'Use recommended fallback', '← Back']);
      Vitest.expect(text).toBe('stop');
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('offers profiles from the profile store for a profile-shaped select', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() => writeProfile(cwd, 'auditor', 'Audits the codebase.'));
      yield* Effect.promise(() => writeProfile(cwd, 'builder', 'Builds the product.'));
      yield* Effect.promise(() =>
        writePrompt(
          cwd,
          Prompts.make('audit', 'Profile: {{profile}}', 'Runs with a profile.', '', [
            variable('profile', { type: 'select', options: ['auditor'] }),
          ]),
        ),
      );
      const { ui, offered } = scriptedUi({ selects: ['auditor'] });
      const text = yield* run(Interactive.constructWizard(ui, cwd, 'audit'));
      Vitest.expect(offered[0]).toContain('auditor');
      Vitest.expect(offered[0]).toContain('builder');
      Vitest.expect(offered[0]).toContain('← Back');
      Vitest.expect(text).toBe('Profile: auditor');
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('offers the recommended fallback for an optional guard variable', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(
          cwd,
          Prompts.make(
            'audit',
            '{{#if scope}}Scope: {{scope}}{{else}}Scope: all.{{/if}}',
            'Audits with a scope.',
            '',
            [variable('scope', { required: false })],
          ),
        ),
      );
      const { ui, offered } = scriptedUi({ selects: ['Use recommended fallback'] });
      const text = yield* run(Interactive.constructWizard(ui, cwd, 'audit'));
      Vitest.expect(offered[0]).toContain('Use recommended fallback');
      Vitest.expect(text).toBe('Scope: all.');
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('lets the user go back and re-answer a prior variable', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(
          cwd,
          Prompts.make('audit', '{{a}} and {{b}}', 'Joins two values.', '', [
            variable('a'),
            variable('b'),
          ]),
        ),
      );
      // a: enter x → b: back → a: enter y → b: enter z
      const { ui, asked } = scriptedUi({
        selects: ['Enter a value…', '← Back', 'Enter a value…', 'Enter a value…'],
        inputs: ['x', 'y', 'z'],
      });
      const text = yield* run(Interactive.constructWizard(ui, cwd, 'audit'));
      Vitest.expect(text).toBe('y and z');
      // a select is offered per variable, then the input dialog; after back the
      // first variable is asked again.
      Vitest.expect(asked).toStrictEqual(['a', 'a', 'b', 'a', 'a', 'b', 'b']);
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('fails with CANCELLED when the user dismisses a dialog', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(cwd, Prompts.make('audit', '{{a}}', 'Single value.', '', [variable('a')])),
      );
      const { ui } = scriptedUi({ selects: [undefined] });
      const error = yield* run(Interactive.constructWizard(ui, cwd, 'audit').pipe(Effect.flip));
      Vitest.expect(error).toBe(Interactive.CANCELLED);
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('refuses with an actionable message when not interactive', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      const { ui } = scriptedUi();
      const error = yield* run(
        Interactive.constructWizard(ui, cwd, 'audit', { interactive: false }).pipe(Effect.flip),
      );
      Vitest.expect(error).toBe(Interactive.NON_TTY_MESSAGE);
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );

  Vitest.it.effect('fails on an unknown prompt name, naming the list command', () =>
    Effect.gen(function* () {
      const cwd = yield* Effect.promise(root);
      yield* Effect.promise(() =>
        writePrompt(cwd, Prompts.make('audit', 'Audit everything.', 'Audits the workspace.')),
      );
      const { ui } = scriptedUi();
      const error = yield* run(Interactive.constructWizard(ui, cwd, 'nope').pipe(Effect.flip));
      Vitest.expect(error).toContain("Unknown prompt 'nope'");
      Vitest.expect(error).toContain('mf-prompts list');
      yield* Effect.promise(() => rm(cwd, { recursive: true, force: true }));
    }),
  );
});
