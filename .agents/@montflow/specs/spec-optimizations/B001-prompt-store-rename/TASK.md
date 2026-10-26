---
id: B001
name: prompt-store-rename
type: execution
originator: user
size: medium
depends-on:
related-tasks:
status: complete
---

# Task B001: prompt-store-rename

## Type: execution

## Description

Move the prompt store off the retired Pi name. The directory becomes
`.agents/@montflow/prompts/`, and every path constant, diagnostic, test, and
live doc follows. Prompt contents and skill names are B004's job.

## Requirements

- Move `.agents/@montflow/pi-prompts/` to `.agents/@montflow/prompts/` with git,
  keeping all four prompt files and their contents byte-identical.
- Update the path constants and comments: `packages/prompts` (`PROMPTS_DIR`,
  `prompt-store`, `prompt-execute` diagnostics, CLI binary description,
  renderers), and `apps/workspace` (`prompts.services.module.ts`).
- Update every live mention of the old path in `README.md`, `AGENTS.md`,
  `packages/prompts/README.md`, package `CONTEXT.md` files, and
  `.agents/@montflow/profiles/bookkeeper/PROFILE.md`.
- Update the tests that hardcode the old path or a temp copy of it:
  `prompt-store` read-raw, `prompts` verify, CLI `engines`, workspace prompt
  service tests.
- Leave historical spec records and existing CHANGELOG entries untouched; add a
  new changelog entry where the package tracks this change.
- Do not rename skill names here; `pi-specs`, `pi-skills`, and `pi-profiles`
  references belong to B003 and B004.

## Completion

- [ ] `.agents/@montflow/prompts/` holds the same four prompt files
- [ ] `grep -rn "pi-prompts" packages apps .agents --exclude-dir=node_modules` finds only historical records and changelogs
- [ ] `bun run --cwd packages/prompts test`, `lint:check`, `format:check`, and `ts:check` pass
- [ ] `bun run mf:check:prompts` passes
