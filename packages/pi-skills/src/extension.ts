// eslint-disable-next-line montflow/no-node-platform-imports -- composition root shells out to the skills CLI; migrate to Command when the installer moves onto the layer graph.
import { execFile } from 'node:child_process';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { DynamicBorder } from '@earendil-works/pi-coding-agent';
import { Container, Input, Key, SelectList, Text, matchesKey } from '@earendil-works/pi-tui';
import { Loading, Menu, ModelPicker } from '@montflow/pi-interactive';
import { Effect } from 'effect';
import { Cli, Interactive, Runs } from './apps/index.js';
import { Skill, SkillStore } from './modules/index.js';

/**
 * Frontmatter parser, re-exported from the pure skill module so the
 * verifier and the store share one grammar.
 */
export const parseSkillFile = Skill.parseSkillFile;
export type ParsedSkillFile = Skill.ParsedSkillFile;
export type FieldValue = Skill.FieldValue;

/** The file codec, re-exported so hosts keep one import site. */
export const decodeSkillFile = Skill.decodeSkillFile;
export const encodeSkillFile = Skill.encodeSkillFile;

/** File-backed store for a working directory. */
const storeFor = (cwd: string): Interactive.SkillStore => ({
  list: () => SkillStore.list(cwd),
  readRaw: (id) => SkillStore.readRaw(cwd, id),
  save: (skill) => SkillStore.save(cwd, skill),
  delete: (id) => SkillStore.remove(cwd, id),
});

/**
 * Agent prompts shared by every host. Re-exported from the interactive
 * flows module (single source of truth) — the run dispatcher and the
 * workspace TUI both build child prompts from these.
 */
export const AUTHOR_PREPROMPT = Interactive.AUTHOR_PREPROMPT;
export const AUTHOR_POSTPROMPT = Interactive.AUTHOR_POSTPROMPT;
export const MODIFY_PREPROMPT = Interactive.MODIFY_PREPROMPT;
export const MODIFY_POSTPROMPT = Interactive.MODIFY_POSTPROMPT;
export const TRANSFORM_PREPROMPT = Interactive.TRANSFORM_PREPROMPT;
export const TRANSFORM_POSTPROMPT = Interactive.TRANSFORM_POSTPROMPT;

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
 * Pi extension entry: registers `/mf-skills` (headless CLI, matching the
 * `mf-skills` binary), `/mf-skills-tui` (interactive, manual and agentic),
 * and `/mf-runs`-backed agentic flows, with a file-backed store per working
 * directory. Skills live in the regular `.agents/skills/` location.
 *
 * Agentic create, modify, and transform dispatch a `@montflow/pi-runs`
 * run instead of running a child agent inline: the command names the run
 * id and unwinds, the run writes the `SKILL.md`, and its completion hook
 * re-encodes the result and reports the outcome. Follow or steer a live
 * run with `/mf-runs`. One runner runtime is built per repo root and
 * released on session shutdown, so runs stay steerable for the life of
 * the session.
 * @param pi - Pi extension API
 * @returns Nothing
 */
export default function piSkillsExtension(pi: ExtensionAPI): void {
  const runs = Runs.makeSkillRunPorts({ storeFor });
  pi.on('session_shutdown', () => runs.shutdown());
  Cli.register(pi).pipe(Effect.runSync);
  Interactive.register(
    pi,
    storeFor,
    runs.generateFor,
    runs.modifyFor,
    installerFor,
    (ctx) =>
      ctx.mode === 'tui'
        ? (title, dialogOptions) => filterSelectDialog(ctx.ui, title, dialogOptions)
        : undefined,
    (ctx) =>
      ctx.mode === 'tui'
        ? (models) => ModelPicker.modelPickerDialog(ctx.ui, models).pipe(Effect.runPromise)
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
    runs.transformFor,
  );
}
