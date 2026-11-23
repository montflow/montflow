# References CLI app

The `mf-references` binary and the `/mf-references` slash command: register,
materialize, and verify third-party reference clones. A reference lives at
`.agents/@montflow/references/<slug>/REFERENCE.md`; its plain clone lives at
`.agents/references/<slug>`.

## Verbs

- `doctor` — verify and repair the workspace scaffolding, registry, and packaged
  skills (`--check` reports without writing).
- `list` — every entry with clone presence and purpose (`--status installed|missing`).
- `show <name>` — one entry's `REFERENCE.md` bytes.
- `verify [<name>|--all] [--clones]` — committed store bytes, plus local clone
  state with `--clones`; non-zero on any issue.
- `add <url> [--name <slug>] [--ref <ref>] [--purpose <text>]` — register and
  clone one https URL; a registered URL routes to `update`.
- `update <name|url>|--all [--force] [--ref <commit|tag|branch>|--latest|--wizard]`
  — refresh one entry or `--all` by name or URL. `--ref <commit|tag|branch>`
  writes the resolved pin to `REFERENCE.md` (validated against the remote first)
  and refreshes; `--latest` removes the `ref:` line so the entry follows the
  tracked branch; `--wizard` (or a bare `update <name>` in a terminal) prompts
  for a specific commit or latest. `--ref`, `--latest`, and `--wizard` are
  mutually exclusive; `--wizard --all` is a usage error; `--ref`/`--latest`
  with `--all` apply to every entry. A `--ref`/`--latest`/`--wizard` run prints
  the `REFERENCE.md` change as a diff and leaves it **uncommitted** for review.
- `sync <name>|--all` — materialize missing clones or repair local checkouts;
  never writes the store.
- `status [<name>] [--fetch]` — clone state per entry; `--fetch` adds
  behind/ahead. A recorded `ref:` that is a branch renders `tracking <branch>`;
  a commit or tag renders `pinned to <sha7>` (full 40-hex with `--verbose`).
- `remove <name> [--keep-clone]` — unregister one entry.

Every verb takes `--dir <root>` (defaults to the working directory). The default
output is agent-first; `--human` renders readable tables and prose, `--verbose`
adds detail, and the two compose on every verb that renders rows or a result.

## Belongs here

- `engines` — headless operations returning domain results over the lifecycle,
  never text
- `renderers` — pure `data -> text`, token-lean, no ANSI
- `binary` / `main` — `effect/cli` flags and exit codes only
- `update-wizard` — the interactive target prompt (TTY-gated, io injectable for
  headless tests)
- `slash` — the hand-rolled `/mf-references` parser over the same engines

## Does not belong here

- Store shape, decoding, and writes — `modules/reference` + `services/reference-store`
- Git ownership, dirty, and ref-resolution logic — `modules/git`
- CI-safe registry and clone verification — `modules/verifier`
- Scaffolding and packaged-skill verification — `apps/doctor`
