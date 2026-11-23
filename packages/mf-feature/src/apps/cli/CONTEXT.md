# CLI app

The `mf-feature` binary (Bun + `effect/cli`). Harness-agnostic: no slash command,
no plugin face, no dialog. Verbs: `roles [show]`, `roles set`, `roles unset`,
`roles verify`, `roles resolve`, `dispatch`, plus `version`.

## Belongs here

- `engines.apps.module.ts` — every decision: the current harness, the loaded
  and verified file, the resolution, the dispatch plan. Structured in, data
  out, failures as a displayable string naming the fix
- `renderers.apps.module.ts` — pure `data -> text`; agent-first `key=value`
  lines, each seat ending in `next=`; `--human` tables; `--verbose` additive
- `binary.apps.module.ts` — the `Command` tree, `rootCommand`, and `COMMANDS`
- `main.ts` — the binary entry

## Rules

- **`COMMANDS` lists every command path.** The binary test spawns `--help` for
  each, and fails when shipped text names an `mf-feature` command not in it. Add
  a verb there and to the tree together.
- **Never guess the harness.** No `--harness`, no `MF_FEATURE_HARNESS`, and not
  exactly one harness's markers is a refusal.
- **Nothing resolves from a file with errors.** `resolve`, `show`, `set` and
  `dispatch` refuse and point at `roles verify`.
- **`dispatch` never runs a native or dropped seat.** It refuses and says what
  to do instead.
- **A non-zero exit is set inside the handler**, never `process.exit`.
