# PrincipleStore service

Read-only, file-backed access to
`<root>/.agents/@montflow/principles/<name>/PRINCIPLE.md`, where `<root>` is the
workspace root (`--dir`).

## Belongs here

- `readAllRaw` — every store directory, undecoded, so `verify` sees corrupt files
- `list` — the principles that decode, name-sorted
- `readRaw` — one file's bytes for `show`

## Does not belong here

- Writes — principles are package payload installed by `doctor`, or files a
  person edits by hand; the CLI has no create/modify/delete
- Verification rules — those live in `../../modules/principle/`
