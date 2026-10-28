---
id: E001
name: audit-scoped-verification
type: exploratory
originator: user
depends-on: D002
related-tasks:
status: complete
---

# Task E001: Audit scoped verification

## Type: exploratory

## Description

Inventory every `mf-*` CLI and every place a verification command is documented,
then classify each command as scoped, global, or broken. The goal is a single
table the fix tasks can apply mechanically, so no agent has to guess which
`--dir` and artifact argument a scoped run needs.

## Requirements

- For each CLI (`skills`, `prompts`, `specs`, `profiles`, `reviews`, `references`): binary name, canonical verbs, the single-artifact argument (positional name versus `--name`), and the exact scoped command run from the repo root.
- Record whether the scoped command needs `--dir $PWD`, and prove it by running each one against an existing artifact.
- Inventory every doc that shows a verification command: `AGENTS.md`, `.agents/documentation/author-mf-utility-cli.md`, package READMEs and CLI `CONTEXT.md` files, workspace and packaged skills, profiles, CI, and Lefthook.
- Classify each documented command as scoped, global (legitimate CI or full gate), or broken; record the corrected form and the file and line.
- Record where `mf:check:<domain>`, `mf:check`, and `mf:gate` are presented as a local check for one artifact; those are the fix targets.
- Decide whether a mechanical doc guard is cheap enough to build in E003, and record the decision with the reason.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Per-CLI scoped command table recorded and each command run successfully
- [ ] Every documented verification command classified with file and line
- [ ] Global-gate misuse list and doc-guard decision recorded
