---
id: A005
name: explore-packaging-and-verification
type: exploratory
originator: user
depends-on: A002
related-tasks:
status: pending
---

# Task A005: Determine how plugins are packaged, verified, and distributed

## Type: exploratory

## Description

Determine how an OpenCode plugin package is authored, loaded, verified, and
distributed, and how that fits montflow's turbo, Changesets, and
`verify:montflow` tooling.

## Requirements

- Record the plugin package shape (entrypoint exports, `./tui`/`./rpc`, peer deps, `effect` handling) and the local dev/load workflow from the OpenCode docs.
- Record how OpenCode resolves and installs plugins (directory scan, `opencode.jsonc`, `cli.json`, package/Git/local resolution, file watching, and the runtime module redirection).
- Identify the `effect` version pin mismatch (host versus montflow) and what a plugin must avoid bundling.
- Determine what montflow verification can cover without running OpenCode (unit tests, adapter contract tests, a loader smoke test) and what cannot be verified headlessly.
- Record the distribution options (Git URL versus npm) and their impact on Changesets and the existing release workflow.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Package shape and loader/config model captured in MEMORY.md
- [ ] Version pins and the Effect-redirection constraint recorded
- [ ] Verification and distribution options captured
