---
id: C001
name: fix-plugin-host-loading
type: execution
originator: user
depends-on: B001
related-tasks: A001, B001
status: done
---

# Task C001: fix-plugin-host-loading

## Type: execution

## Description

Make the packaged server entries import under the host's plugin runtime. This is
the prerequisite for everything else: a picker that cannot load is a picker that
does not exist. The scope is the compatibility decision from B001, applied to
`@montflow/opencode` and the plugin packages, with no TUI work.

## Requirements

- Apply the B001 strategy so importing `packages/prompts/src/server.ts` under the
  host runtime succeeds instead of throwing on `effect`/`@opencode/schema` skew.
- Remove the loader-rejected imports (`effect/dist/...` reached through package
  roots or barrels) from every plugin's server graph, not only prompts.
- Keep `@opencode/*` imports inside `@montflow/opencode`, as the package
  architecture requires.
- Delete the prompts stopgap's duplicated store read once the packaged entry
  loads; `.opencode/plugins/` must not carry a second command implementation.
- Package-scoped checks pass: `bun run --cwd packages/prompts test`,
  `ts:check`, `lint:check`, `format:check`, plus the same for every package
  touched.
- A host session reports the plugin as loaded and `/mf-prompts list` replies.

## Completion

- [ ] Every plugin server entry imports under the host runtime.
- [ ] Stopgap duplication removed.
- [ ] Scoped checks green.
