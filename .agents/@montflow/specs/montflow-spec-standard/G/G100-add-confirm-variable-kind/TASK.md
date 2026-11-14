---
id: G100
name: add-confirm-variable-kind
type: execution
originator: defect:G001
size: tiny
depends-on: G003, G004
write-scope: packages/prompts/src/modules/prompts, packages/prompts/src/modules/prompt-execute, packages/prompts/src/apps/interactive, packages/prompts/src/apps/cli, apps/workspace/src/services/prompts
related-tasks: G001, G002
status: complete
---

# Task G100: add-confirm-variable-kind

## Type: execution

## Description

G001's decided union includes a boolean confirm kind, but G002-G004 shipped text/textarea/select only: the schema rejects type confirm, so no truthy controller can exist and the ui.confirm path is unreachable. Add confirm end to end.

## Requirements

- Accept type confirm in the variable schema and round-trip it like the other kinds; confirm carries no options, default, or required.
- Treat a confirm value as the canonical yes/empty pair and make truthy visibility resolvable through a real confirm controller.
- Widen PromptExecute VariableSummary.type and the interactive fill so a confirm is asked via ui.confirm and never as free text.
- Widen the CLI render/execute validation and the workspace editor to accept and round-trip a confirm controller.
- Add acceptance and rejection tests for a confirm controller with truthy visibility, and keep every existing prompt valid.

## Completion

- [x] A `confirm` variable round-trips and carries no options, default, or required
- [x] A `confirm` controller resolves `truthy` visibility and a hidden dependent stays hidden
- [x] The interactive fill asks a `confirm` through `ui.confirm`, never free text
- [x] CLI validation and the workspace editor accept a `confirm` controller
- [x] `bun run --cwd packages/prompts test` and `bun run --cwd apps/workspace test` pass
