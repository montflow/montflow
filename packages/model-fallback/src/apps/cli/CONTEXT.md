# Model-fallback CLI app

The `mf-model-fallback` binary: status, show, set, migrate, verify, remove, and
doctor the workspace configuration. Agents drive this instead of editing files.

## Belongs here

- `engines` — headless operations returning domain results, never text
- `renderers` — pure `data -> text`, token-lean, no ANSI
- `binary` / `main` — `effect/cli` flags and exit codes only

## Does not belong here

- Store shape, writes, and precedence — `fallback-store`
- Legacy `opencode.jsonc` handling — `fallback-file`
- Catalog and ranking rules — `model-catalog`
- Artifact installation — `apps/doctor`
