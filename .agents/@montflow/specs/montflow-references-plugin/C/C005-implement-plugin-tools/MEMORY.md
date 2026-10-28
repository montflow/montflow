# Memory

## Context

- Task: **C005 — implement-plugin-tools** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Task read: `.../C005-implement-plugin-tools/TASK.md` (1–38) and
  `GATES.md` (1–14).
- Contract sources read in full: B003 `MEMORY.md` §8 (server entry), §9 (extra
  tools: none), §10 (TUI id-only no-op), §11 (skills, not this task), plus §5
  (engine/renderer split, tools import engines directly) and the B003 test
  table. B003's dependency memories were not re-read; C004's memory and the
  live code supplied the engine contracts.
- Implementation consumed: C004's `src/apps/cli/` (`engines`, `renderers`,
  `slash` with `register`, `index` barrel), C003's `Git.AddResult` shape
  (`created` / `routed{notice,update}` / `refused|failed`), C002's
  `Reference`, `ReferenceStore`, `CloneProbe`, and C001's scaffold
  (`server.ts`, `tui.ts`, exports map).
- Live precedent read end to end: `packages/reviews/src/server.ts`,
  `packages/skills/src/server.ts`, `packages/reviews/src/tui.ts`,
  `packages/reviews/src/tests/server.test.ts` (fake host, fake ports, tool
  invocation), `packages/opencode/src/modules/ports/tool/tool.module.ts`,
  `packages/opencode/src/modules/ports/ports.module.ts`,
  `packages/opencode/src/modules/ports/plugin-entry/plugin-entry.module.ts`.
- Scope executed: only `packages/references/` and this `MEMORY.md`. No doctor,
  skill, doc, root script, CI cell, registry entry, or spec state was touched.

## Progress

Done, in order:

1. Read the profile, C005 `TASK.md`/`GATES.md`, B003 §8–§11, C004's memory,
   the C004 CLI stack, and the sibling server entries/tests.
2. Added the pure `Reference.matches` predicate (`packages/references/src/
   modules/reference/reference.module.ts`) over slug, URL, purpose, and notes,
   with a unit test.
3. Rebuilt `src/server.ts` as the full plugin entry: `entry(ID, …)` registers
   `/mf-references` through `Cli.register`, then `reference_add` and
   `reference_find` through `ports.tool.add`. Both tools call
   `Cli.Engines.*` with `Engines.Live`; neither reads `ports.session`,
   `ports.agent`, or `ports.model`.
4. Implemented all B003 §8 tool literals: created/routed add success lines,
   exact-find block with `path`, candidate rows capped at eight, no-match line,
   and routed-update failure propagation.
5. Added `src/tests/server.test.ts` with the reviews fake-host pattern: a fake
   command editor, fake tool editor, and a session port that throws if called.
   Covers command registration, exact tool set, add success strings, a
   displayable refusal, exact find with missing and installed clone states,
   purpose/notes substring matching, no-match, and TUI load.
6. Kept `src/tui.ts` as the B003 §10 id-only no-op; it was already correct.
7. Ran every gate and mapped each Stage 0/1 checkbox to a named test.

## Findings

### 1. What was built

| File | Change |
|---|---|
| `src/server.ts` | `ID`/`COMMAND_NAME`/`COMMAND_DESCRIPTION`, `addSuccessText`, `reference_add`, `reference_find`, default `entry(ID, …)` |
| `src/modules/reference/reference.module.ts` | `MatchableReference` + pure `matches()` predicate |
| `src/modules/reference/tests/reference.test.ts` | one new test for `matches` |
| `src/tests/server.test.ts` | new server/tool/TUI test file (6 cases) |
| `src/tui.ts` | unchanged; already the id-only no-op |

No other file changed. `src/apps/cli/**` was reused as-is.

### 2. Server entry

- `export const ID = 'references'`.
- `COMMAND_NAME`/`COMMAND_DESCRIPTION` re-export the CLI constants, so the
  slash command is `/mf-references` and help text is the C004 string.
- Default export:
  `entry(ID, (ports) => Effect.gen(function* () { yield* Cli.register(ports);
  yield* ports.tool.add(addTool(ports)); yield* ports.tool.add(findTool(ports)); }))`.
- The tools construct their scope as `{ cwd: ports.cwd }`; no `--dir` leaks
  into a tool contract.
- Only `command`, `tool`, and `cwd` are read. The fake host's session port is a
  trap that throws `reference tools must not call the session port (<op>)`, and
  every integration test asserts the dispatch log is empty.

### 3. `reference_add`

- Input: `{ url: string; name?: string; ref?: string; purpose?: string }` —
  exactly B003 §8.
- Runs `Engines.add`; `kind: 'created'` returns
  `created <slug> <url>; registered .agents/@montflow/references/<slug>/REFERENCE.md.`
- `kind: 'routed'` returns `<notice>; <update.message>.` and fails with
  `update.message` when `Renderers.updateFailed(update)` — so a routed notice
  alone is never success (B003 F11).
- `refused`/`failed` results become `Effect.fail(result.message)`, which
  `defineTool` maps to `Tool.Error({ message })`; the model sees the engine's
  displayable string unchanged.
- Why no session: the URL is validated, the slug derived, the clone a fixed git
  argv, and the entry a fixed template (B003 §8).

### 4. `reference_find`

- Input: `{ query: string }` — exactly B003 §8.
- Reads `Engines.list`; no git, no fetch, no clone. Exact slug wins, then exact
  normalized URL (`Reference.normalizeUrl`), then a case-insensitive substring
  match over slug, URL, purpose, and notes.
- Exact block:

  ```
  <slug>  installed|missing
  url: <url>
  ref: <ref>            # only when the entry records one
  purpose: <purpose>
  path: .agents/references/<slug>
  ```

  A missing clone ends `path: .agents/references/<slug> (missing — run
  mf-references sync <slug>)`. `path` is B003 §8's documented exception for
  this tool only; no CLI default was changed.
- Non-exact hits render `installed|missing <slug>  <purpose>` in store order
  (slug-sorted), cap at 8, then `… <n> more`.
- No hit: `No reference matches '<query>'. <n> references registered; run
  mf-references list to see them.`
- Notes come from the entry's `REFERENCE.md` body via `Engines.show` and
  `Reference.decodeReferenceFile`; an unreadable body matches as empty rather
  than failing the lookup.

### 5. Determinism / no dispatch

- Neither tool calls `ports.session.create/prompt/wait/reply`; the server file
  does not even import the session port type.
- Tests make any session call a defect and assert `host.dispatches` is `[]` in
  the registration, refusal, exact-find, and candidate tests.

### 6. TUI entry

`src/tui.ts` already matched B003 §10 exactly:
`{ id: ID, setup: () => () => {} } satisfies TuiPlugin`. It is covered by the
`loads the TUI entry as an id-only no-op` test; `exports['./tui']` in
`package.json` is unchanged.

### 7. Gate output, verbatim

```text
$ bun run --cwd packages/references test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/reference-plugin/packages/references


 Test Files  24 passed (24)
      Tests  214 passed (214)
Type Errors  no errors
   Start at  15:56:53
   Duration  2.69s (import 62%, tests 32%, transform 3%, typecheck 3%)
```

```text
$ bun run --cwd packages/references ts:check
$ tsc --noEmit
```

(no output, exit 0)

```text
$ bun run --cwd packages/references lint:check
$ oxlint --deny-warnings .
(node:1432079) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/oxlint.config.ts?cache=1793044607973 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1432079) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/tooling/oxlint/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
```

(no lint finding, exit 0; the two `MODULE_TYPELESS_PACKAGE_JSON` warnings are
the pre-existing environment noise C001–C004 recorded)

```text
$ bun run --cwd packages/references format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 249ms on 44 files using 16 threads.
```

Server test names, verbatim:

```text
 ✓ src/tests/server.test.ts > references server plugin > registers /mf-references and exactly the two deterministic tools 37ms
 ✓ src/tests/server.test.ts > references server plugin > builds the single success line for created and routed adds 0ms
 ✓ src/tests/server.test.ts > references server plugin > a reference_add refusal is a displayable string and dispatches nothing 27ms
 ✓ src/tests/server.test.ts > references server plugin > reference_find returns an exact entry with its clone path 64ms
 ✓ src/tests/server.test.ts > references server plugin > reference_find matches purpose and notes as candidate rows 25ms
 ✓ src/tests/server.test.ts > references server plugin > loads the TUI entry as an id-only no-op 0ms
```

### 8. `GATES.md` checkbox → named passing test

| Stage | Checkbox | Evidence |
|---|---|---|
| 0 | the server entry registers `/mf-references` | `references server plugin > registers /mf-references and exactly the two deterministic tools` (asserts `host.commands` = `['mf-references']` and description contains `mf-references`) |
| 0 | the server entry registers `reference_add` and `reference_find` | same test (asserts `host.tools` = `['reference_add', 'reference_find']`) |
| 0 | any tool B003 approved beyond those two is registered | same test asserts the tool list is **exactly** those two; B003 §9 approves none |
| 0 | the TUI entry loads | `references server plugin > loads the TUI entry as an id-only no-op` |
| 1 | a tool failure returns a displayable string | `references server plugin > a reference_add refusal is a displayable string and dispatches nothing` (engine refusal reaches `Tool.Error.message`) |
| 1 | no tool calls a session port | fake session port throws if called; `host.dispatches` asserted `[]` in the registration, refusal, exact-find, and candidate tests |
| 1 | the server test passes | `bun run --cwd packages/references test` output above (24 files, 214 tests, no type errors) |

Additional coverage beyond the checkboxes: `builds the single success line
for created and routed adds` pins B003 §8's created/routed literals; `matches`
is unit-tested in `reference.test.ts`.

## Open Questions

1. **No end-to-end `reference_add` success test through the live tool.** The
   tool hardcodes `Engines.Live` (B003 §5), so a hermetic created/routed add
   cannot be driven through the fake host: the real `GitPort` either clones
   over the network or, with an `insteadOf` rewrite, makes the clone probe see
   the rewritten origin and refuse ownership. The success literal is covered
   by the pure `addSuccessText` test, and the created/routed engines are
   already covered by C004's engine tests. If a full tool-level success is
   wanted, the tool factory must accept an injected git layer — a deliberate
   seam change, not a test fix.
2. **Empty `reference_find` query.** B003 is silent. C005 returns the no-match
   line (`No reference matches ''. <n> references registered; …`) rather than a
   usage refusal. A reviewer may prefer `refused: query must not be empty`.
3. **Notes are matched but not returned.** TASK requires matching name, URL,
   purpose, and notes; B003 §8's exact block returns entry facts only. C005
   follows both: notes affect matching, the block stays as specified. If the
   skill wants notes in the result, that is a tool-contract change.
4. **Notes matching reads every entry.** `reference_find` calls `Engines.show`
   per row to get the body. At 14 entries this is instant and still git-free;
   a future large store would want one `ReferenceStore.scan` pass.

## Handoff

- **C006 (doctor):** `src/server.ts` now registers command + two tools; adding a
  `doctor` verb still belongs in `binary/slash` only. Do not add a doctor tool
  without B003 §9's five-condition rule.
- **C007 (gate/migration):** the tool surface is closed at two tools; the plugin
  loader face assertion, if any, should expect `reference_add` and
  `reference_find` only.
- **D001/D002/E003:** tools are intentionally undocumented in the CLI table;
  B003 §9's rule requires the consuming skill and docs table to name a new tool
  in the same change. The existing skill pipelines use the CLI, not tools.
- **Future tool additions:** apply B003 §9's five conditions; keep
  `addSuccessText`-style literals pinned by tests, and keep the session port
  trap in `src/tests/server.test.ts` as the determinism guard.

## Deviations

- **`Reference.matches` added to the reference module.** B003 §8 assigns the
  predicate there; the implementation also includes notes, which TASK requires
  and B003's prose did not enumerate.
- **`addSuccessText` exported from `server.ts`.** It is a pure formatter split
  out so the success literals are testable without a live clone; the tool is
  its only production caller. This is a testability seam, not a new tool or
  surface.
- **No new engine and no new CLI verb were added.** `find` composes
  `Engines.list` + `Engines.show`; `add` calls the existing engine.
- **Only `packages/references/` and this `MEMORY.md` were written.** `bun.lock`
  was already modified before this task (C001's install; C004 recorded it) and
  was not touched. No spec state, lock, ledger, or other task directory was
  edited.
