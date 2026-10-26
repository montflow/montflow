import { defineTool, entry, type ServerPorts } from '@montflow/opencode';
import { Effect, Schema } from 'effect';
import * as Cli from './apps/cli/index.js';
import type * as Engines from './apps/cli/engines.apps.module.js';
import { Git, Reference } from './modules/index.js';

/**
 * OpenCode server plugin entry.
 *
 * The slash command is `/mf-references`; the agent surface is the two
 * deterministic tools `reference_add` and `reference_find`. Both are thin
 * adapters over the same engines and renderers the CLI uses, and neither ever
 * dispatches a session — every reference operation is a git or store call.
 */

/** Plugin id shared by the server and TUI entries. */
export const ID = 'references';

/** Slash command registered by the server plugin (invoke as `/mf-references`). */
export const COMMAND_NAME = Cli.COMMAND_NAME;

/** Help text shown for the slash command. */
export const COMMAND_DESCRIPTION = Cli.COMMAND_DESCRIPTION;

/** The caller form named in tool fix-it text. */
const INVOCATION = 'mf-references';

/** Where a tool reads the store: the host project directory. */
const scopeOf = (ports: ServerPorts): Engines.StoreScope => ({ cwd: ports.cwd });

/**
 * The one `reference_add` success line. Created entries name where the entry
 * was written; a routed add names update's own result, never only the notice.
 * @param result - a created or successfully routed engine result
 * @returns the agent-compact line
 */
export const addSuccessText = (result: Git.AddCreated | Git.AddRouted): string =>
  result.kind === 'created'
    ? `${result.message}; registered ${Reference.entryPath(result.slug)}.`
    : `${result.notice}; ${result.update.message}.`;

/**
 * `reference_add` — register and clone one https URL. A registered URL routes
 * to `update`; a routed notice is never reported as success unless the update
 * itself ended `present`. Failures are the engine's displayable refusal text.
 */
const addTool = (ports: ServerPorts) =>
  defineTool({
    name: 'reference_add',
    description:
      'Register and clone one https git URL as a reference. Writes .agents/@montflow/references/<slug>/REFERENCE.md after the clone succeeds; a URL that is already registered is refreshed through update. SSH, scp, file://, and local paths are refused — pass the https URL. Returns one compact success line or a displayable refusal.',
    input: Schema.Struct({
      url: Schema.String,
      name: Schema.optional(Schema.String),
      ref: Schema.optional(Schema.String),
      purpose: Schema.optional(Schema.String),
    }),
    execute: (input) =>
      Effect.gen(function* () {
        const result = yield* Cli.Engines.add(scopeOf(ports), input.url, {
          name: input.name,
          ref: input.ref,
          purpose: input.purpose,
          invocation: INVOCATION,
        }).pipe(Effect.provide(Cli.Engines.Live));

        if (result.kind === 'created') return addSuccessText(result);
        if (result.kind === 'routed') {
          if (Cli.Renderers.updateFailed(result.update)) {
            return yield* Effect.fail(result.update.message);
          }
          return addSuccessText(result);
        }
        return yield* Effect.fail(result.message);
      }),
  });

/** The clone-state line `reference_find` always prints, `path` included. */
const pathLine = (row: Engines.ReferenceRow): string =>
  row.installed
    ? `path: ${row.path}`
    : `path: ${row.path} (missing — run ${INVOCATION} sync ${row.slug})`;

/**
 * One exact hit: the entry's facts plus its clone state. B003 §8 makes `path`
 * the documented exception for this tool only; no CLI verb inherits it.
 * @param row - the matching store row
 * @returns the rendered block
 */
const exactBlock = (row: Engines.ReferenceRow): string => {
  const lines = [`${row.slug}  ${row.installed ? 'installed' : 'missing'}`, `url: ${row.url}`];
  if (row.ref !== undefined && row.ref !== '') lines.push(`ref: ${row.ref}`);
  lines.push(`purpose: ${row.purpose}`, pathLine(row));
  return lines.join('\n');
};

/** Read one entry's body notes, or empty text when the entry is unreadable. */
const notesOf = (
  ports: ServerPorts,
  slug: string,
): Effect.Effect<string, never, Engines.EngineDeps> =>
  Cli.Engines.show(scopeOf(ports), slug, INVOCATION).pipe(
    Effect.map((raw) => Reference.decodeReferenceFile(raw)?.body ?? ''),
    Effect.orElseSucceed(() => ''),
  );

/** Candidate rows cap, with a `… <n> more` line when the store is larger. */
const CANDIDATE_LIMIT = 8;

/** One candidate row, in the same shape `list` uses for the agent default. */
const candidateLine = (row: Engines.ReferenceRow): string =>
  `${row.installed ? 'installed' : 'missing'} ${row.slug}  ${row.purpose}`;

/**
 * `reference_find` — read-only store lookup by slug, URL, purpose, or notes.
 * Exact slug, then exact normalized URL, then a capped substring search.
 */
const findTool = (ports: ServerPorts) =>
  defineTool({
    name: 'reference_find',
    description:
      'Find a registered reference by slug, URL, purpose, or notes. Returns the exact entry with its clone path and installed/missing state, up to eight candidate rows, or a no-match line. Read-only: it never clones, fetches, or dispatches a session.',
    input: Schema.Struct({ query: Schema.String }),
    execute: (input) =>
      Effect.gen(function* () {
        const query = input.query.trim();
        const rows = yield* Cli.Engines.list(scopeOf(ports), { invocation: INVOCATION });

        const exact =
          rows.find((row) => row.slug === query) ??
          (query === ''
            ? undefined
            : rows.find(
                (row) =>
                  row.url !== '' &&
                  Reference.normalizeUrl(row.url) === Reference.normalizeUrl(query),
              ));
        if (exact !== undefined) return exactBlock(exact);

        const matched: Array<Engines.ReferenceRow> = [];
        for (const row of rows) {
          const notes = yield* notesOf(ports, row.slug);
          if (
            Reference.matches({ name: row.slug, url: row.url, purpose: row.purpose, notes }, query)
          ) {
            matched.push(row);
          }
        }

        if (matched.length === 0) {
          return `No reference matches '${query}'. ${rows.length} references registered; run ${INVOCATION} list to see them.`;
        }
        const shown = matched.slice(0, CANDIDATE_LIMIT).map(candidateLine);
        if (matched.length > CANDIDATE_LIMIT) {
          shown.push(`… ${matched.length - CANDIDATE_LIMIT} more`);
        }
        return shown.join('\n');
      }).pipe(Effect.provide(Cli.Engines.Live)),
  });

/**
 * OpenCode server plugin entry: registers `/mf-references` over the shared CLI
 * engines, then both deterministic tools. No session, agent, or model port is
 * read.
 */
export default entry(ID, (ports) =>
  Effect.gen(function* () {
    yield* Cli.register(ports);
    yield* ports.tool.add(addTool(ports));
    yield* ports.tool.add(findTool(ports));
  }),
);
