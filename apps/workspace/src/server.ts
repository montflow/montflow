import { defineTool, entry } from '@montflow/opencode';
import { Effect, Schema } from 'effect';
import { Workspace } from './modules/index.js';
import { GitInfo, Prompts, Profiles, Skills, Specs } from './services/index.js';

/** Plugin id shared by the server and TUI entries. */
export const ID = 'workspace';

/** Slash command registered by the server plugin (invoke as `/mf-workspace`). */
export const COMMAND_NAME = 'mf-workspace';

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION =
  'Report the workspace root, branch, cleanliness, and the size of every montflow store the dashboard reads.';

/** One store count, tolerant of a missing store. */
const countOf = <A>(rows: Effect.Effect<ReadonlyArray<A>, string>): Effect.Effect<number> =>
  rows.pipe(
    Effect.map((entries) => entries.length),
    Effect.orElseSucceed(() => 0),
  );

/**
 * One-line workspace summary plus store counts. Native-store reads only — the
 * same file stores the TUI page renders, so the model and the dashboard can
 * never disagree about what exists.
 * @param root - workspace root
 * @returns human-readable report
 */
export const summarize = (root: string): Effect.Effect<string> =>
  Effect.gen(function* () {
    const info = yield* GitInfo.getInfo(root);
    const skills = yield* countOf(Skills.fetchSkills(root));
    const profiles = yield* countOf(Profiles.fetchProfiles(root));
    const prompts = yield* countOf(Prompts.fetchPrompts(root));
    const specs = yield* countOf(Specs.fetchSpecs(root));
    return [
      Workspace.title(info),
      `root ${info.root}`,
      `branch ${info.branch} ${info.clean ? '✓ clean' : '✗ dirty'}`,
      `stores skills ${skills} · profiles ${profiles} · prompts ${prompts} · specs ${specs}`,
      'The grid is the TUI route page `/workspace` (ctrl+w).',
    ].join('\n');
  });

/**
 * OpenCode server plugin entry: `workspace_info` for the model and
 * `/mf-workspace` for a session. The interactive grid itself is the TUI face.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    const root = ports.cwd;
    yield* ports.tool.add(
      defineTool({
        name: 'workspace_info',
        description:
          'Report the montflow workspace: root, git branch, clean/dirty state, and how many skills, profiles, prompts, and specs are stored. Read-only; use it before pointing a user at the dashboard or a store path.',
        input: Schema.Struct({}),
        execute: () => summarize(root),
      }),
    );
    yield* ports.command.register({
      name: COMMAND_NAME,
      description: COMMAND_DESCRIPTION,
      execute: () =>
        summarize(root).pipe(
          Effect.flatMap((report) => Effect.logInfo(report)),
          Effect.orElseSucceed(() => undefined),
        ),
    });
  }),
);
