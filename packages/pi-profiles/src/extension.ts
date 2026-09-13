// eslint-disable-next-line montflow/no-node-platform-imports -- composition root shells out to the skills CLI; migrate to Command when the installer moves onto the layer graph.
import { execFile } from 'node:child_process';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { AgentRun } from '@montflow/pi-effect';
import { Loading, Menu, ModelPicker, PiInteractive } from '@montflow/pi-interactive';
import { Effect, Layer } from 'effect';
import { FileSystem } from 'effect/FileSystem';
import { Path } from 'effect/Path';
import { Cli, Interactive } from './apps/index.js';
import { PiProfiles } from './modules/index.js';
import { ProfileStore } from './services/index.js';

/** Node platform layers for the services the store needs. */
const NodeLive = Layer.mergeAll(NodeFileSystem.layer, NodePath.layer);

/**
 * Full store layer: file-backed `ProfileStore` with its platform
 * dependencies hidden. Handlers receive it via `register`.
 */
const Live = Layer.provide(ProfileStore.Default, NodeLive);

/** Absolute skills directory for a working directory: `<cwd>/.agents/skills`. */
export const skillsDir = (path: Path, cwd: string): string => path.join(cwd, '.agents', 'skills');

/**
 * Read the `name:` frontmatter scalar from a `SKILL.md` file, falling
 * back to the directory name. Minimal parse — full decoding lives in
 * `@montflow/pi-skills`.
 * @param markdown - raw SKILL.md contents
 * @param dirName - skill directory slug
 * @returns frontmatter name, or the directory name
 */
const skillNameFrom = (markdown: string, dirName: string): string => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return dirName;
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line.trim() === '---') break;
    const match = /^name:\s*(.*)$/.exec(line.trim());
    if (match !== null) {
      const value = (match[1] ?? '').trim();
      if (value !== '') return value;
    }
  }
  return dirName;
};

/**
 * Read one scalar frontmatter field (`key: value`), ignoring list blocks.
 * @param markdown - raw SKILL.md contents
 * @param key - field name
 * @returns scalar value, or empty
 */
const skillField = (markdown: string, key: string): string => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return '';
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index] ?? '';
    if (line.trim() === '---') break;
    const match = new RegExp(`^${key}:\\s*(.*)$`).exec(line.trim());
    if (match !== null) {
      const value = (match[1] ?? '').trim();
      if (value !== '') return value;
    }
  }
  return '';
};

/**
 * List installed skills as injection candidates: id plus the frontmatter
 * name/description the preprompt rules reason about. Malformed files
 * fall back to directory-name identity so the gate never blocks on
 * parse errors.
 * @param dir - absolute skills directory
 * @returns Effect resolving to the installed skills
 */
const listInstalledSkills = (
  dir: string,
): Effect.Effect<ReadonlyArray<Interactive.InstalledSkill>, never, FileSystem | Path> =>
  Effect.gen(function* () {
    const fs = yield* FileSystem;
    const path = yield* Path;
    const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => [] as const));
    return yield* Effect.forEach(entries, (entry) =>
      fs.readFileString(path.join(dir, entry, 'SKILL.md')).pipe(
        Effect.map((raw): Interactive.InstalledSkill => {
          const end = raw.indexOf('---', 3);
          const body = end === -1 ? '' : raw.slice(end + 3).trim();
          const dependencies: Array<string> = [];
          const depBlock = /dependencies:\s*\n((?:[ \t]+-\s+.+\n?)*)/.exec(raw);
          if (depBlock !== null) {
            for (const match of (depBlock[1] ?? '').matchAll(/[ \t]+-\s+(.+)/g)) {
              const item = (match[1] ?? '').trim();
              if (item !== '') dependencies.push(item);
            }
          }
          return {
            id: entry,
            name: skillNameFrom(raw, entry),
            description: skillField(raw, 'description'),
            dependencies,
            body,
          };
        }),
        Effect.catch(() =>
          Effect.succeed({
            id: entry,
            name: entry,
            description: '',
            dependencies: [],
            body: '',
          } satisfies Interactive.InstalledSkill),
        ),
      ),
    );
  });

/**
 * File-backed profile store for a working directory.
 * @param cwd - project working directory
 * @returns store reading/writing `<cwd>/.agents/@montflow/pi-profiles`
 */
const storeFor = (cwd: string): Interactive.ProfileStore => ({
  list: () =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      return yield* store.list(cwd);
    }).pipe(Effect.provide(Live)),
  save: (profile) =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      yield* store.save(cwd, profile);
    }).pipe(
      Effect.provide(Live),
      Effect.mapError((error) => error.message),
    ),
  delete: (name) =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      yield* store.remove(cwd, name);
    }).pipe(
      Effect.provide(Live),
      Effect.mapError((error) => error.message),
    ),
  readRaw: (name) =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      return yield* store.readRaw(cwd, name);
    }).pipe(
      Effect.provide(Live),
      Effect.mapError((error) => error.message),
    ),
});

/**
 * Skill inventory for a working directory: `<cwd>/.agents/skills`.
 * Drives the requirements gate — creation runs inject `authoring-profiles`,
 * modification runs inject `modifying-profiles`, format-fix runs inject both.
 * @param cwd - project working directory
 * @returns inventory port for the requirements gate
 */
const skillsFor = (cwd: string): Interactive.SkillStore => ({
  list: () =>
    Effect.gen(function* () {
      const path = yield* Path;
      return yield* listInstalledSkills(skillsDir(path, cwd));
    }).pipe(Effect.provide(NodeLive)),
});

/**
 * Instructions before the user description: the child agent authors
 * exactly one profile, then stops. Transported as the preprompt.
 * Tells the agent where the file goes, the `PROFILE.md` shape, and the
 * skill-reference rule (list `.agents/skills/` and read each `SKILL.md`
 * frontmatter `name:` before referencing a skill).
 */
export const AUTHOR_PREPROMPT = `You are a profile author for a pi coding agent.

Create exactly one new agent profile following the format below, then stop. Do not
ask follow-up questions — work from the description as given.

---
name: <kebab-case-name>
description: <one line: the agent's role and what it does>
model: <provider/model-id, or blank when unset>
skills:
  - <skill-name>
---

# <Profile Name>

## Instructions

<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>

## Review Checklist

- [ ] <What the reviewer must verify before the work is done>
- [ ] <What the reviewer must verify before the work is done>

Rules:
- Write the new profile at .agents/@montflow/pi-profiles/<name>/PROFILE.md (choose a
  kebab-case <name> that fits the description), with the frontmatter block exactly as
  shown (name/description required; model/skills optional, blank model when unset).
- The description must say WHAT the agent is (its role and job — it drives profile selection).
- List .agents/skills/ and read each SKILL.md frontmatter 'name:' before
  listing a skill — reference existing skills only, otherwise leave skills
  empty (or omit the key).
- If .agents/skills/authoring-profiles/SKILL.md exists, follow its standards.
- The Instructions section holds the custom system prompt; the Review Checklist
  holds at least one verifiable item.
- If a profile with that name already exists, pick a fresh name instead.
- Do not touch anything outside .agents/@montflow/pi-profiles/.`;

/**
 * Instructions after the user description: the reply shape.
 * Transported as the postprompt.
 */
export const AUTHOR_POSTPROMPT =
  'When done, reply with one short line: the profile name and what it does.';

/**
 * Instructions before the change request: the child agent edits the single
 * named profile, then stops. Transported as the preprompt.
 */
export const MODIFY_PREPROMPT = `You are a profile editor for a pi coding agent.

Modify the single profile named in the request, keeping the PROFILE.md schema valid
(frontmatter name/description/model/skills plus # Title, ## Instructions,
## Review Checklist), then stop. Do not ask follow-up questions — work from
the change as given.

Rules:
- Edit only the named profile under .agents/@montflow/pi-profiles/.
- Do not rename the profile directory and do not change the 'name' field.
  Do not touch anything else.
- Keep the description saying WHAT the agent is (its role and job).
- Reference existing skills only (check .agents/skills/ SKILL.md frontmatter
  'name:' values); drop unknown names instead of inventing them.
- If .agents/skills/authoring-profiles/SKILL.md exists, follow its standards.
- Keep at least one Review Checklist item.`;

/**
 * Instructions after the change request: the reply shape.
 * Transported as the postprompt.
 */
export const MODIFY_POSTPROMPT = 'When done, reply with one short line: what changed.';

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
 * Agentic profile generation for a working directory: runs the generic
 * {@link AgentRun.runAgent} with the profile-authoring preprompt, then
 * loads the new PROFILE.md. New profiles are detected by name diff, so
 * agent chatter never parses.
 * @param cwd - project working directory
 * @returns generator port for the interactive flows
 */
const generateFor =
  (cwd: string): Interactive.ProfileGenerator =>
  (input) =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      const before = yield* store.list(cwd);
      const beforeNames = new Set(before.map((profile) => profile.name));
      yield* AgentRun.runAgent({
        cwd,
        preprompt: AUTHOR_PREPROMPT + Interactive.formatInjectedSkills(input.inject),
        prompt: `Profile description: ${input.description}`,
        postprompt: AUTHOR_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* store.list(cwd);
      const fresh = after.find((profile) => !beforeNames.has(profile.name));
      if (fresh === undefined) {
        return yield* Effect.fail(
          'The agent finished without creating a profile — try describing it differently.',
        );
      }
      return fresh;
    }).pipe(Effect.provide(Live));

/**
 * Agentic profile modification for a working directory: runs the generic
 * {@link AgentRun.runAgent} with the profile-editing preprompt, then
 * reloads the named PROFILE.md.
 * @param cwd - project working directory
 * @returns modifier port for the interactive flows
 */
const modifyFor =
  (cwd: string): Interactive.ProfileModifier =>
  (input) =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      yield* AgentRun.runAgent({
        cwd,
        preprompt:
          MODIFY_PREPROMPT +
          '\n\nProfile to edit: ' +
          input.profile.name +
          Interactive.formatInjectedSkills(input.inject),
        prompt: `Change request: ${input.instruction}`,
        postprompt: MODIFY_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* store.list(cwd);
      const updated = after.find((profile) => profile.name === input.profile.name);
      if (updated === undefined) {
        return yield* Effect.fail(
          'The agent finished without updating the profile — try describing the change differently.',
        );
      }
      return updated;
    }).pipe(Effect.provide(Live));

/**
 * Instructions before the fix request: bring exactly the named profile
 * into the standard format, then stop. Transported as the preprompt.
 */
export const FIX_PREPROMPT =
  'You are a profile editor for a pi coding agent. Bring exactly the profile named below ' +
  'into the standard profile format, then stop. Do not ask follow-up questions. ' +
  'Keep what the profile teaches unchanged — fix the shape only: frontmatter must have ' +
  'name (matching the directory), description (one line: role and job), ' +
  'plus model/skills when non-empty; ' +
  'the body must have `# Title`, `## Instructions`, and `## Review Checklist` with at least one item. ' +
  'If .agents/skills/authoring-profiles/SKILL.md exists, follow its standards. ' +
  'Do not rename the profile directory. Do not touch anything outside that profile directory.';

/** Instructions after the fix request: the reply shape. */
export const FIX_POSTPROMPT =
  'When done, reply with one short line: the profile name and what was fixed.';

/**
 * Agentic profile format-fix for a working directory: same shape as the
 * modify port, so the interactive flows reuse `ProfileModifier`.
 * @param cwd - project working directory
 * @returns fixer port for the interactive detail menu
 */
const fixFor =
  (cwd: string): Interactive.ProfileModifier =>
  (input) =>
    Effect.gen(function* () {
      const store = yield* ProfileStore.ProfileStore;
      yield* AgentRun.runAgent({
        cwd,
        preprompt:
          FIX_PREPROMPT +
          '\n\nProfile to fix: ' +
          input.profile.name +
          Interactive.formatInjectedSkills(input.inject),
        prompt: 'Fix request: ' + input.instruction,
        postprompt: FIX_POSTPROMPT,
        modelLabel: input.modelLabel,
        tools: ['read', 'write', 'edit'],
      }).pipe(
        Effect.mapError((error) => error.message),
        Effect.provide(AgentRuntimeLive),
      );
      const after = yield* store.list(cwd);
      const updated = after.find((profile) => profile.name === input.profile.name);
      if (updated === undefined) {
        return yield* Effect.fail('The agent finished without updating the profile — try again.');
      }
      return updated;
    }).pipe(Effect.provide(Live));

/**
 * Install skills into the workspace via the `skills` CLI (same mechanism
 * as the skills extension): `npx skills add montflow/montflow`. This is
 * how a missing `authoring-profiles` dependency arrives — from this
 * repository, through the existing skill tooling.
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

/** TUI filter picker factory for the interactive flows (TUI-only). */
const searchFor = (ctx: { readonly ui: Interactive.FilterUi; readonly mode: string }) =>
  ctx.mode === 'tui'
    ? (title: string, dialogOptions: ReadonlyArray<string>) =>
        PiInteractive.filterSelectDialog(ctx.ui, title, dialogOptions).pipe(Effect.runPromise)
    : undefined;

/** TUI model picker factory for the interactive flows (TUI-only). */
const modelPickerFor = (ctx: { readonly ui: Interactive.FilterUi; readonly mode: string }) =>
  ctx.mode === 'tui'
    ? (models: ReadonlyArray<Interactive.ModelOption>) =>
        ModelPicker.modelPickerDialog(ctx.ui, models).pipe(Effect.runPromise)
    : undefined;

/** TUI loading-modal factory for the interactive flows (TUI-only). */
const loadingFor = (ctx: { readonly ui: Interactive.FilterUi; readonly mode: string }) =>
  ctx.mode === 'tui'
    ? <A, E>(message: string, self: Effect.Effect<A, E, never>) =>
        Loading.run(ctx.ui, message, self)
    : undefined;

/** TUI main-menu factory for the interactive flows (TUI-only). */
const menuFor = (ctx: { readonly ui: Interactive.FilterUi; readonly mode: string }) =>
  ctx.mode === 'tui'
    ? (title: string, info: ReadonlyArray<string>, options: ReadonlyArray<string>) =>
        Menu.menuDialog(ctx.ui, title, options, info)
    : undefined;

/**
 * Pi extension entry: registers `/mf-profiles` (interactive, manual and
 * agentic) and `/mf-profiles-cli` (headless, manual-only for agents and
 * scripts) with a file-backed store per directory. The loader awaits the
 * returned promise, so load failures surface.
 *
 * Profiles live at `.agents/@montflow/pi-profiles/<name>/PROFILE.md`
 * (namespaced like `pi-prompts`; the legacy `zi` layout was
 * `.agents/@montflow/profiles/`). Creation runs inject the
 * `authoring-profiles` workspace skill and modification runs inject
 * `modifying-profiles`: the requirements gate offers to
 * install them from this repository (`npx skills add montflow/montflow`)
 * and injects them into agentic runs.
 * @param pi - Pi extension API
 * @returns Promise settling once registration completes
 */
export default function piProfilesExtension(pi: ExtensionAPI): Promise<void> {
  return Effect.gen(function* () {
    yield* Effect.sync(() =>
      Interactive.register(
        pi,
        storeFor,
        skillsFor,
        generateFor,
        modifyFor,
        installerFor,
        searchFor,
        modelPickerFor,
        loadingFor,
        menuFor,
        fixFor,
      ),
    );
    yield* Cli.register(pi, Live);
  }).pipe(Effect.runPromise);
}

export { PiProfiles };
