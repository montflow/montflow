---
id: E003
name: document-scoping-per-cli
type: execution
originator: user
depends-on: E002
related-tasks:
status: complete
---

# Task E003: Document scoping per CLI

## Type: execution

## Description

Give every `mf-*` CLI a documented single-artifact command and make the
distinction between a scoped local check and a whole-store CI cell impossible
to miss. The spec CLIs are fixed in E002; this task covers the rest and adds a
guard if E001 judged one cheap.

## Requirements

- Add a scoped-verification line or table to each package README and CLI `CONTEXT.md` (`skills`, `prompts`, `specs`, `profiles`, `reviews`, `references`): the exact single-artifact command, and `mf:check:<domain>` labelled as the whole-store CI cell.
- Update `.agents/documentation/author-mf-utility-cli.md`: add a scoped-verification section with the rule and the per-CLI commands, and separate the local scoped check from the CI gate in the verification section.
- Add the mechanical doc guard E001 approved (a test that fails when a documented `bun run --cwd packages/<domain> cli` local invocation omits `--dir`), or record why the guard is not worth its cost.
- Update every package changelog whose README or `CONTEXT.md` changed, and any doc that names a now-corrected command.
- Confirm no documented local example runs `mf:check:<domain>`, `mf:check`, or `mf:gate` for one artifact; global gates remain documented as CI or final-gate commands.
- Gates: every CLI README/CONTEXT carries the scoped command, the guide states the rule, the guard (if built) passes, and the grep for unscoped local examples is clean.
- No file outside the package docs, `.agents/documentation/`, `AGENTS.md` cross-links, and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Every CLI documents its single-artifact scoped command
- [ ] The CLI guide separates scoped checks from whole-store gates
- [ ] Doc guard built or its omission justified; all checks pass
