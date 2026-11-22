# CLI app

The `mf-principles` binary (Bun + `effect/cli`). Harness-agnostic: no slash
command, no plugin face, no dialog. Verbs: `doctor [--check]`, `list`,
`show <name>`, `verify [<name>] [--all]`, plus the free `--help`/`--version`.

## Belongs here

- `engines.apps.module.ts` — `list`, `show`, `verify`, `doctor`. Structured in,
  data out, failures as a displayable string naming the invocation
- `renderers.apps.module.ts` — pure `data -> text`; agent-first default,
  `--human` tables and glyphs, `--verbose` additive
- `binary.apps.module.ts` — the `Command` tree and `rootCommand`
- `main.ts` — the binary entry

## Rules

- **`--dir` is the workspace root**, never the store directory.
- **A non-zero exit is set inside the handler** via `exitFailed`; never
  `process.exit`, so piped stdout flushes.
- **`show` prints bytes unchanged** through `writeRaw`, with no added newline.
- **`list` is the index**: one `<name>: <description>` line per principle.
