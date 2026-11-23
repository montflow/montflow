# PlaybookStore service

Read-only, file-backed access to two stores under the workspace root (`--dir`):
the shipped `.agents/@montflow/playbooks/<name>/PLAYBOOK.md` (doctor-owned) and
the repo's extensions at
`.agents/@montflow/mf-mode/extensions/playbooks/<name>/PLAYBOOK.md`
(consumer-owned). Both are read the same way, through `../markdown-store/`.

## Belongs here

- `readAllRaw` — every shipped directory, undecoded, so `verify` sees corrupt files
- `readExtensionsRaw` — every extension directory, the same way
- `resolve` — both stores through `Extension.resolve`: what `list` and `show`
  read, extension over shipped
- `references` — the names a playbook's reference lists resolve against, read
  by path from the same root: `.agents/skills/<name>/SKILL.md`, principles
  shipped or extension, and playbooks shipped or extension. Never through
  `@montflow/principles` or `@montflow/skills`, so the packages stay
  independent

## Does not belong here

- Writes — shipped playbooks are package payload installed by `doctor`, and
  extensions are files the repo commits; the CLI has no create/modify/delete
- Verification rules — those live in `../../modules/playbook/`
- The merge and provenance — those live in `../../modules/extension/`
