# PlaybookStore service

Read-only, file-backed access to
`<root>/.agents/@montflow/playbooks/<name>/PLAYBOOK.md`, where `<root>` is the
workspace root (`--dir`).

## Belongs here

- `readAllRaw` — every store directory, undecoded, so `verify` sees corrupt files
- `list` — the playbooks that decode, name-sorted
- `readRaw` — one file's bytes for `show`
- `references` — the names a playbook's reference lists resolve against, read
  by path from the same root: `.agents/skills/<name>/SKILL.md`,
  `.agents/@montflow/principles/<name>/PRINCIPLE.md`, and this store. Never
  through `@montflow/principles` or `@montflow/skills`, so the packages stay
  independent

## Does not belong here

- Writes — playbooks are package payload installed by `doctor`, or files a
  person edits by hand; the CLI has no create/modify/delete
- Verification rules — those live in `../../modules/playbook/`
