# PrincipleStore service

Read-only, file-backed access to two stores under the workspace root (`--dir`):
the shipped `.agents/@montflow/principles/<name>/PRINCIPLE.md` (doctor-owned)
and the repo's extensions at
`.agents/@montflow/mf-mode/extensions/principles/<name>/PRINCIPLE.md`
(consumer-owned). Both are read the same way, through `../markdown-store/`.

## Belongs here

- `readAllRaw` — every shipped directory, undecoded, so `verify` sees corrupt files
- `readExtensionsRaw` — every extension directory, the same way
- `resolve` — both stores through `Extension.resolve`: what `list` and `show`
  read, extension over shipped

## Does not belong here

- Writes — shipped principles are package payload installed by `doctor`, and
  extensions are files the repo commits; the CLI has no create/modify/delete
- Verification rules — those live in `../../modules/principle/`
- The merge and provenance — those live in `../../modules/extension/`
