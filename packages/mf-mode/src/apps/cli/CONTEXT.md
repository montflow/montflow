# CLI app

The `mf-mode` binary (Bun + `effect/cli`). Harness-agnostic: no slash command,
no plugin face, no dialog. Verbs: `doctor`, `verify` (roles, principles, playbooks), `roles [show]`, `roles set`, `roles unset`,
`roles verify`, `roles resolve`, `dispatch`, `principles list|show|verify`,
`playbooks list|show|verify`, plus `version`.

## Belongs here

- `engines.apps.module.ts` — every decision: the current harness, the loaded
  and verified file, the resolution, the dispatch plan. Structured in, data
  out, failures as a displayable string naming the fix
- `principle-engines.apps.module.ts`, `playbook-engines.apps.module.ts` — `list`,
  `show`, `verify` over one markdown store, the repo's extensions
  (`.agents/@montflow/mf-mode/extensions/<store>/`) over the shipped copies.
  `show` prints a `source=` provenance line, then the resolved document (file
  bytes unchanged unless it `extends`). `list` rows carry their source.
  `verify` checks the shipped entries as before and each extension, as
  `extension/<name>`, to the same standard on its resolved document
- `principle-renderers.apps.module.ts`, `playbook-renderers.apps.module.ts` — pure
  `data -> text` for those stores; a `list` row not shipped ends in its
  `source=`, and `--human` adds a SOURCE column
- `renderers.apps.module.ts` — pure `data -> text`; agent-first `key=value`
  lines, each seat ending in `next=`; `--human` tables; `--verbose` additive
- `binary.apps.module.ts` — the `Command` tree, `rootCommand`, and `COMMANDS`
- `main.ts` — the binary entry

## Rules

- **`COMMANDS` lists every command path.** The binary test spawns `--help` for
  each, and fails when shipped text names an `mf-mode` command not in it. Add
  a verb there and to the tree together.
- **Never guess the harness.** No `--harness`, no `MF_MODE_HARNESS`, and not
  exactly one harness's markers is a refusal.
- **Nothing resolves from a file with errors.** `resolve`, `show`, `set` and
  `dispatch` refuse and point at `roles verify`.
- **`dispatch` never runs a native or dropped seat.** It refuses and says what
  to do instead.
- **A non-zero exit is set inside the handler**, never `process.exit`.
- **Agents read playbooks and principles through the CLI.** The binary test
  fails when shipped skill, playbook, principle, or profile text points at a
  store file (`@montflow/playbooks/`, `.../PLAYBOOK.md`) instead of
  `mf-mode playbooks show <name>`, since only the CLI applies extensions.
