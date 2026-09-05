import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import { Container, Input, Key, SelectList, Text, matchesKey } from '@earendil-works/pi-tui';
import { NodeFileSystem, NodePath } from '@effect/platform-node';
import { AgentRun } from '@montflow/pi-effect';
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

/** One frontmatter value: a scalar `key: value` line or a `- item` list. */
type FieldValue = string | Array<string>;

/** Parsed frontmatter fields plus the markdown body after the block. */
export interface ParsedSkillFile {
  readonly fields: Record<string, FieldValue>;
  readonly body: string;
}

/**
 * Read one scalar field. Lists and missing keys read as undefined so the
 * caller falls back (directory name, empty string).
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns the scalar value, if present
 */
const fieldString = (fields: Record<string, FieldValue>, key: string): string | undefined => {
  const value = fields[key];
  if (value === undefined || Array.isArray(value)) return undefined;
  return value;
};

/**
 * Read one list field. Scalars and missing keys read as empty.
 * @param fields - parsed frontmatter fields
 * @param key - field name
 * @returns non-blank items
 */
const fieldStrings = (fields: Record<string, FieldValue>, key: string): ReadonlyArray<string> => {
  const value = fields[key];
  if (!Array.isArray(value)) return [];
  return value.filter((item) => item.trim() !== '');
};

/**
 * Parse the frontmatter subset `zi` writes: scalar `key: value` lines plus
 * blank-value keys followed by `  - item` list lines. `#` comment lines
 * skip. Returns null when no `---` block opens the file.
 * @param markdown - raw SKILL.md contents
 * @returns frontmatter fields plus body, or null
 */
export const parseSkillFile = (markdown: string): ParsedSkillFile | null => {
  const lines = markdown.split(/\r?\n/);
  if ((lines[0] ?? '').trim() !== '---') return null;
  let endIndex = -1;
  for (let index = 1; index < lines.length; index++) {
    if ((lines[index] ?? '').trim() === '---') {
      endIndex = index;
      break;
    }
  }
  if (endIndex === -1) return null;
  const fields: Record<string, FieldValue> = {};
  const fmLines = lines.slice(1, endIndex);
  let index = 0;
  while (index < fmLines.length) {
    const trimmed = (fmLines[index] ?? '').trim();
    index++;
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const match = /^([\w-]+):\s*(.*)$/.exec(trimmed);
    if (match === null) continue;
    const key = match[1] ?? '';
    const rawValue = (match[2] ?? '').trim();
    if (rawValue === '') {
      const items: Array<string> = [];
      while (index < fmLines.length) {
        const listMatch = /^[ \t]+-\s+(.+)$/.exec(fmLines[index] ?? '');
        if (listMatch === null) break;
        items.push((listMatch[1] ?? '').trim());
        index++;
      }
      fields[key] = items;
    } else {
      fields[key] = rawValue;
    }
  }
  return {
    fields,
    body: lines
      .slice(endIndex + 1)
      .join('\n')
      .trim(),
  };
};

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
  const parsed = parseSkillFile(markdown);
  if (parsed === null) return Effect.fail(`Malformed SKILL.md in '${dirName}'.`);
  const { fields, body } = parsed;
  const rawName = fieldString(fields, 'name');
  const name = rawName === undefined || rawName === '' ? dirName : rawName;
  const description = fieldString(fields, 'description') ?? '';
  return Skill.decodeUnknown({
    id: dirName,
    name,
    description,
    groups: fieldStrings(fields, 'groups'),
    dependencies: fieldStrings(fields, 'dependencies'),
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
const storeFor = (cwd: string): Interactive.SkillStore => ({
  list: () =>
    Effect.gen(function* () {
      const path = yield* Path;
      return yield* list(skillsDir(path, cwd));
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
        preprompt: AUTHOR_PREPROMPT,
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
  Interactive.register(pi, storeFor, generateFor, (ctx) =>
    ctx.mode === 'tui'
      ? (title, dialogOptions) => filterSelectDialog(ctx.ui, title, dialogOptions)
      : undefined,
  );
}
