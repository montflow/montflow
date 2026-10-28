# Model-fallback CLI app

The `mf-model-fallback` binary: show, set, verify, remove, and doctor the
workspace chain. Agents drive this instead of editing `opencode.jsonc`.

## Belongs here

- `engines` — headless operations returning domain results, never text
- `renderers` — pure `data -> text`, token-lean, no ANSI
- `binary` / `main` — `effect/cli` flags and exit codes only

## Does not belong here

- Config parsing and writes — `fallback-file`
- Catalog and ranking rules — `model-catalog`
- Artifact installation — `apps/doctor`
