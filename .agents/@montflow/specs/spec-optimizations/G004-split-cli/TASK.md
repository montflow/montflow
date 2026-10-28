---
id: G004
name: split-cli
type: execution
originator: user
size: large
depends-on: G002, G003
related-tasks:
status: pending
---

# Task G004: split-cli

## Type: execution

## Description

`packages/specs/src/apps/cli/cli.apps.module.ts` is 4,443 lines and holds fourteen commands, the slash parser, diagnostics, sizing loading, and renderers. It is the only structural outlier among the new modules.

Split it by command without changing any public export or command behavior.

## Requirements

- Split `packages/specs/src/apps/cli/cli.apps.module.ts` into command-scoped modules: check, status/state/next, sizing/resolve, models, create/list, author/execute/sizing-config, and slash/root, with shared diagnostics and sizing loading in one module.
- `src/apps/cli/index.ts` keeps every public export; `main.ts`, the root command, slash dispatch, and all tests keep working unchanged.
- No source file in the split exceeds roughly 1,000 lines, and no command module imports another command module internals except through the barrel.
- Add a mechanical structure test for the size and import rule if one can be written without brittle file-name coupling.
- Package test, lint, format, typecheck, and CLI smoke probes pass.

## Completion

- [ ] The CLI is split into command-scoped modules
- [ ] No file exceeds roughly 1,000 lines
- [ ] The public barrel and every command output are unchanged
- [ ] A structure test guards the split
- [ ] All package checks and smoke probes pass
