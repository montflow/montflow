// eslint-disable-next-line montflow/no-node-platform-imports -- composition root shells out to the skills CLI; migrate to Command when the installer moves onto the layer graph.
import { execFile } from 'node:child_process';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import { Container, Input, Key, SelectList, Text, matchesKey } from '@earendil-works/pi-tui';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { AgentRun } from '@montflow/pi-effect';
import { Loading, Menu, ModelPicker } from '@montflow/pi-interactive';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { Interactive } from './apps/index.js';
import { Skill } from './modules/index.js';

/** Node live layer for the services the store needs. Provided once per run. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/** Absolute skills directory for a working directory: `<cwd>/.agents/skills`. */
export const skillsDir = (path: Path, cwd: string): string => path.join(cwd, '.agents', 'skills');

/** Failure value for store reads/writes. Surfaced through `SkillStore` as strings. */
export const storeError = (message: string): string => message;

/**
 * Frontmatter parser, re-exported from the pure skill module so the
 * verifier and the store share one grammar.
 */
export const parseSkillFile = Skill.parseSkillFile;
export type ParsedSkillFile = Skill.ParsedSkillFile;
export type FieldValue = Skill.FieldValue;

/**
 * Decode one `SKILL.md` file into a `Skill`. The directory name is the id;
 * frontmatter `name` falls back to it. Malformed files fail.
 * @param dirName - skill directory slug
 * @param markdown - raw SKILL.md contents
 * @returns Effect resolving to the skill, failing on malformed input
 */
export const decodeSkillFile = (
  dirName: string,
  markdown: string,
): Effect.Effect<Skill.Skill, string> => {
  const parsed = Skill.parseSkillFile(markdown);
  if (parsed === null) return Effect.fail(`Malformed SKILL.md in '${dirName}'.`);
  const { fields, body } = parsed;
  const rawName = Skill.fieldString(fields, 'name');
  const name = rawName === undefined || rawName === '' ? dirName : rawName;
  const description = Skill.fieldString(fields, 'description') ?? '';
  return Skill.decodeUnknown({
    id: dirName,
    name,
    description,
    groups: Skill.fieldStrings(fields, 'groups'),
    dependencies: Skill.fieldStrings(fields, 'dependencies'),
    body,
  }).pipe(Effect.mapError(() => `Invalid skill '${dirName}'.`));
};

/**
 * Serialize a `Skill` to `SKILL.md` contents: frontmatter plus body.
 * Empty `groups` / `dependencies` drop their keys.
 * @param skill - skill to persist
 * @returns file contents
 */
export const encodeSkillFile = (skill: Skill.Skill): string => {
  const lines = ['---', `name: ${skill.name}`, `description: ${skill.description}`];
  if (skill.groups.length > 0) {
    lines.push('groups:');
    for (const group of skill.groups) lines.push(`  - ${group}`);
  }
  if (skill.dependencies.length > 0) {
    lines.push('dependencies:');
    for (const dependency of skill.dependencies) lines.push(`  - ${dependency}`);
  }
  lines.push('---', '');
  if (skill.body !== '') lines.push(skill.body, '');
  return lines.join('\n');
};

/**
 * List stored skills, sorted by name. A missing directory reads as empty;
 * malformed files are skipped so the list stays usable.
 * @param dir - absolute skills directory
 * @returns Effect resolving to the stored skills
 */
export const list = (
  dir: string,
): Effect.Effect<ReadonlyArray<Skill.Skill>, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as const));
    const skills = yield* Effect.forEach(entries, (entry) =>
      fs.readFileString(path.join(dir, entry, 'SKILL.md')).pipe(
        Effect.flatMap((raw) => decodeSkillFile(entry, raw)),
        Effect.catch(() => Effect.succeed(undefined)),
      ),
    );
    return skills
      .filter((skill) => skill !== undefined)
      .toSorted((a, b) => a.name.localeCompare(b.name));
  });

/**
 * Write a skill's `SKILL.md` file, creating the directory as needed.
 * @param dir - absolute skills directory
 * @param skill - skill to persist
 * @returns Effect completing once written, failing on write errors
 */
export const save = (
  dir: string,
  skill: Skill.Skill,
): Effect.Effect<void, string, FileSystem | Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const skillDir = path.join(dir, skill.id);
    yield* fs
      .makeDirectory(skillDir, { recursive: true })
      .pipe(
        Effect.mapError((error) => storeError(`Failed to create ${skillDir}: ${String(error)}`)),
      );
    const file = path.join(skillDir, 'SKILL.md');
    yield* fs
      .writeFileString(file, encodeSkillFile(skill))
      .pipe(Effect.mapError((error) => storeError(`Failed to write ${file}: ${String(error)}`)));
  });

/**
 * Delete a skill's directory. The id is slug-validated so it can never
 * escape `.agents/skills/` (no path traversal). Fails on unknown ids.
 * @param dir - absolute skills directory
 * @param id - skill directory slug
 * @returns Effect completing once removed, failing on unknown ids or write errors
 */
export const remove = (dir: string, id: string): Effect.Effect<void, string, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!Skill.isValidName(id)) return yield* Effect.fail(`Unknown skill '${id}'.`);
    const fs = yield* FileSystem;
    const path = yield* Path;
    const skillDir = path.join(dir, id);
    const exists = yield* fs
      .exists(path.join(skillDir, 'SKILL.md'))
      .pipe(Effect.orElseSucceed(() => false as const));
    if (!exists) return yield* Effect.fail(`Unknown skill '${id}'.`);
    yield* fs
      .remove(skillDir, { recursive: true })
      .pipe(
        Effect.mapError((error) => storeError(`Failed to delete ${skillDir}: ${String(error)}`)),
      );
  });

/**
 * File-backed store for a working directory.
 * @param cwd - project working directory
 * @returns store reading/writing `<cwd>/.agents/skills/<slug>/SKILL.md`
 */
/**
 * Read one skill's raw `SKILL.md` file for mechanical verification.
 * The id is slug-validated so it can never escape `.agents/skills/`.
 * @param dir - absolute skills directory
 * @param id - skill directory slug
 * @returns Effect resolving to the raw file contents, failing on unknown ids
 */
export const readRaw = (
  dir: string,
  id: string,
): Effect.Effect<string, string, FileSystem | Path> =>
  Effect.gen(function* () {
    if (!Skill.isValidName(id)) return yield* Effect.fail(`Unknown skill '${id}'.`);
    const fs = yield* FileSystem;
    const path = yield* Path;
    const file = path.join(dir, id, 'SKILL.md');
    const raw = yield* fs.readFileString(file).pipe(Effect.orElseSucceed(() => undefined));
    if (raw === undefined) return yield* Effect.fail(`Unknown skill '${id}'.`);
    return raw;
  });

const storeFor = (cwd: string): Interactive.SkillStore => ({
  list: () =>
    Effect.gen(function* () {
      const path = yield* Path;
      return yield* list(skillsDir(path, cwd));
    }).pipe(Effect.provide(NodeLive)),
  readRaw: (id) =>
    Effect.gen(function* () {
      const path = yield* Path;
      return yield* readRaw(skillsDir(path, cwd), id);
    }).pipe(Effect.provide(NodeLive)),
  save: (skill) =>
    Effect.gen(function* () {
      const path = yield* Path;
      yield* save(skillsDir(path, cwd), skill);
    }).pipe(Effect.provide(NodeLive)),
  delete: (id) =>
    Effect.gen(function* () {
      const path = yield* Path;
      yield* remove(skillsDir(path, cwd), id);
    }).pipe(Effect.provide(NodeLive)),
});

/**
 * Instructions before the user description: the child agent authors
 * exactly one skill, then stops. Transported as the preprompt.
 */
export const AUTHOR_PREPROMPT = `You are a skill author for a pi coding agent.

Create exactly one new skill following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

---
name: <kebab-case-name>
description: <one or two sentences: when to use this skill, what it does>
groups: [<optional comma-separated group tags>]
dependencies: [<optional names of skills this one depends on>]
---

<Body: concise, actionable instructions for the agent that will load this
skill. Use short sections and bullet lists. Include concrete steps, expected
inputs/outputs, and any edge cases. Keep it focused — no filler.>

Rules:
- Write the new skill at .agents/skills/<name>/SKILL.md (choose a kebab-case
  <name> that fits the description), with the frontmatter block exactly as
  shown (name/description required; groups/dependencies optional).
- The description must say WHEN to use the skill (it drives skill selection).
- If a skill with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/skills/.`;

/**
 * Instructions after the user description: the reply shape.
 * Transported as the postprompt.
 */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the skill name and what it does.';

/**
 * Shared model runtime for child agents: one per process. Provided to
 * every {@link AgentRun.runAgent} call by this extension.
 */
const AgentRuntimeLive = Layer.effect(
  AgentRun.AgentModelRuntime,
  Effect.promise(() =>
    import('@earendil-works/pi-coding-agent').then((pi) => pi.ModelRuntime.create()),
  ).pipe(Effect.mapError((error) => `Failed to start the model runtime: ${String(error)}`)),
);

/**
 * Agentic skill generation for a working directory: runs the generic
 * {@link AgentRun.runAgent} with the skill-authoring preprompt,
 * then loads the new SKILL.md. New skills are detected by directory diff,
 * so agent chatter never parses.
 * @param cwd - project working directory
 * @returns generator port for the interactive flows
 */
const generateFor =
  (cwd: string): Interactive.SkillGenerator =>
  (input) =>
    Effect.gen(function* () {
      const path = yield* Path;
      const dir = skillsDir(path, cwd);
      const before = yield* list(dir);
      const beforeIds = new Set(before.map((skill) => skill.id));
      yield* AgentRun.runAgent({
        cwd,
        preprompt: AUTHOR_PREPROMPT + Skill.formatInjectedSkills(input.inject),
        prompt: `Skill description: ${input.description}`,
        postprompt: AUTHOR_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* list(dir);
      const fresh = after.find((skill) => !beforeIds.has(skill.id));
      if (fresh === undefined) {
        return yield* Effect.fail(
          'The agent finished without creating a skill — try describing it differently.',
        );
      }
      return fresh;
    }).pipe(Effect.provide(NodeLive));

/**
 * Instructions before the change request: the child agent edits exactly
 * the named skill in place, then stops. Transported as the preprompt.
 */
export const MODIFY_PREPROMPT =
  'You are a skill editor for a pi coding agent. Edit exactly the skill named below, then stop. ' +
  'Do not ask follow-up questions — work from the change request as given. ' +
  'Do not rename the skill directory. Keep frontmatter keys valid (name/description required; groups/dependencies optional). ' +
  'Keep the description saying WHEN to use the skill. Do not touch anything outside that skill directory.';

/**
 * Instructions after the change request: the reply shape.
 * Transported as the postprompt.
 */
export const MODIFY_POSTPROMPT =
  'When done, reply with one short line: the skill name and what changed.';

/**
 * Agentic skill modification for a working directory: runs the generic
 * {@link AgentRun.runAgent} scoped to the existing skill directory,
 * then re-reads that SKILL.md. The id is slug-validated on read-back,
 * so the agent cannot redirect the result elsewhere.
 * @param cwd - project working directory
 * @returns modifier port for the interactive flows
 */
const modifyFor =
  (cwd: string): Interactive.SkillModifier =>
  (input) =>
    Effect.gen(function* () {
      const path = yield* Path;
      const dir = skillsDir(path, cwd);
      yield* AgentRun.runAgent({
        cwd,
        preprompt:
          MODIFY_PREPROMPT +
          '\n\nSkill to edit: ' +
          input.skill.id +
          Skill.formatInjectedSkills(input.inject),
        prompt: 'Change request: ' + input.instruction,
        postprompt: MODIFY_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* list(dir);
      const updated = after.find((skill) => skill.id === input.skill.id);
      if (updated === undefined) {
        return yield* Effect.fail(
          'The agent finished without updating the skill — try describing the change differently.',
        );
      }
      return updated;
    }).pipe(Effect.provide(NodeLive));

/**
 * Instructions before the fix request: the child agent brings exactly the
 * named skill into the standard format, then stops. Transported as the
 * preprompt.
 */
export const TRANSFORM_PREPROMPT =
  'You are a skill editor for a pi coding agent. Bring exactly the skill named below ' +
  'into the standard skill format, then stop. Do not ask follow-up questions. ' +
  'Keep what the skill teaches unchanged — fix the shape only: frontmatter must have ' +
  'name (matching the directory), description (1-2 sentences saying WHEN to use the skill), ' +
  'id (keep the existing 16-hex value unchanged), author, version (SemVer), ' +
  'plus groups/dependencies lists when non-empty; ' +
  'the body must have `# When To Use`, `# Pipeline`, and `# Reference` sections. ' +
  'Do not rename the skill directory. Do not touch anything outside that skill directory.';

/**
 * Instructions after the fix request: the reply shape.
 * Transported as the postprompt.
 */
export const TRANSFORM_POSTPROMPT =
  'When done, reply with one short line: the skill name and what was fixed.';

/**
 * Agentic skill format-transform for a working directory: runs the generic
 * {@link AgentRun.runAgent} scoped to the existing skill directory with a
 * fixed format-fix instruction, then re-reads that SKILL.md. Same shape as
 * the modify port, so the interactive flows reuse `SkillModifier`.
 * @param cwd - project working directory
 * @returns transformer port for the interactive detail menu
 */
const transformFor =
  (cwd: string): Interactive.SkillModifier =>
  (input) =>
    Effect.gen(function* () {
      const path = yield* Path;
      const dir = skillsDir(path, cwd);
      yield* AgentRun.runAgent({
        cwd,
        preprompt:
          TRANSFORM_PREPROMPT +
          '\n\nSkill to fix: ' +
          input.skill.id +
          Skill.formatInjectedSkills(input.inject),
        prompt: 'Fix request: ' + input.instruction,
        postprompt: TRANSFORM_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* list(dir);
      const updated = after.find((skill) => skill.id === input.skill.id);
      if (updated === undefined) {
        return yield* Effect.fail('The agent finished without updating the skill — try again.');
      }
      return updated;
    }).pipe(Effect.provide(NodeLive));

/**
 * Install skills into the workspace via the `skills` CLI (same mechanism
 * as the syncing-skills flow): `npx skills add montflow/montflow`.
 * @param cwd - project working directory (project-local install target)
 * @param names - skill names to install
 * @returns Effect completing once installed, failing with CLI output
 */
const runSkillsInstall = (cwd: string, names: ReadonlyArray<string>): Promise<void> =>
  new Promise((resolve, reject) => {
    if (names.length === 0) {
      resolve();
      return;
    }
    const args = [
      'skills',
      'add',
      'montflow/montflow',
      ...names.flatMap((name) => ['-s', name]),
      '-a',
      'pi',
      '-y',
    ];
    execFile('npx', args, { cwd, timeout: 180_000 }, (error, _stdout, stderr) => {
      if (error !== null) {
        reject(new Error(`${error.message}\n${String(stderr).slice(-2000)}`));
        return;
      }
      resolve();
    });
  });

/**
 * Skill installer for a working directory: missing requirement skills via
 * the `skills` CLI, project-local to `<cwd>/.agents/skills/`.
 * @param cwd - project working directory
 * @returns installer port for the interactive flows
 */
const installerFor =
  (cwd: string): Interactive.SkillInstaller =>
  (names) =>
    Effect.tryPromise({
      try: () => runSkillsInstall(cwd, names),
      catch: (error) =>
        `Skill install failed: ${error instanceof Error ? error.message : String(error)}`,
    });

/**
 * Live filter-as-you-type picker: an input row over a scrollable list.
 * Typing narrows by subsequence match; arrows/enter/escape drive the list.
 * TUI-only — callers fall back to input+select elsewhere.
 * @param ui - Pi ui context with custom component support
 * @param title - dialog title
 * @param options - full option list
 * @returns the picked option, or undefined on cancel
 */
export const filterSelectDialog = (
  ui: Interactive.FilterUi,
  title: string,
  options: ReadonlyArray<string>,
): Promise<string | undefined> =>
  ui.custom<string | undefined>((tui, theme, _keybindings, done) => {
    const container = new Container();
    const border = (): DynamicBorder =>
      new DynamicBorder((line: string) => theme.fg('accent', line));
    container.addChild(border());
    container.addChild(new Text(title, 1, 0));
    const query = new Input();
    query.focused = true;
    container.addChild(query);
    const LIST_INDEX = 3;
    const buildList = (items: ReadonlyArray<string>): SelectList => {
      const selectList = new SelectList(
        items.map((value) => ({ value, label: value })),
        10,
        {
          selectedPrefix: (text) => theme.fg('accent', text),
          selectedText: (text) => theme.fg('accent', text),
          description: (text) => theme.fg('muted', text),
          scrollInfo: (text) => theme.fg('dim', text),
          noMatch: (text) => theme.fg('warning', text),
        },
      );
      selectList.onSelect = (item) => done(item.value);
      selectList.onCancel = () => done(undefined);
      return selectList;
    };
    let current = buildList(options);
    container.addChild(current);
    container.addChild(new Text('↑↓ navigate • type to filter • enter select • esc cancel', 1, 0));
    container.addChild(border());
    return {
      get focused() {
        return query.focused;
      },
      set focused(value: boolean) {
        query.focused = value;
      },
      render: (width: number) => container.render(width),
      invalidate: () => container.invalidate(),
      handleInput: (data: string) => {
        if (
          matchesKey(data, Key.up) ||
          matchesKey(data, Key.down) ||
          matchesKey(data, Key.enter) ||
          matchesKey(data, Key.escape)
        ) {
          current.handleInput(data);
        } else {
          query.handleInput(data);
          const filtered = options.filter((option) =>
            Interactive.matchesFilter(option, query.getValue()),
          );
          const next = buildList(filtered);
          container.children.splice(LIST_INDEX, 1, next);
          current = next;
        }
        tui.requestRender();
      },
    };
  });

/**
 * Pi extension entry: registers the `/mf-skills` command with a file-backed
 * store per working directory. Skills live in the regular
 * `.agents/skills/` location shared with the `zi` extension.
 * @param pi - Pi extension API
 * @returns Nothing
 */
export default function piSkillsExtension(pi: ExtensionAPI): void {
  Interactive.register(
    pi,
    storeFor,
    generateFor,
    modifyFor,
    installerFor,
    (ctx) =>
      ctx.mode === 'tui'
        ? (title, dialogOptions) => filterSelectDialog(ctx.ui, title, dialogOptions)
        : undefined,
    (ctx) =>
      ctx.mode === 'tui'
        ? (models) => Effect.runPromise(ModelPicker.modelPickerDialog(ctx.ui, models))
        : undefined,
    (ctx) =>
      ctx.mode === 'tui'
        ? <A, E>(message: string, self: Effect.Effect<A, E, never>) =>
            Loading.run(ctx.ui, message, self)
        : undefined,
    (ctx) =>
      ctx.mode === 'tui'
        ? (title: string, info: ReadonlyArray<string>, options: ReadonlyArray<string>) =>
            Menu.menuDialog(ctx.ui, title, options, info)
        : undefined,
    transformFor,
  );
}
