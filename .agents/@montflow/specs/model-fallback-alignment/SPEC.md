---
name: model-fallback-alignment
status: complete
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-28
locked-phases: A
---

# model-fallback-alignment

## Description

The model-fallback plugin keeps its chain in `opencode.jsonc` `plugins[].options`.
That file belongs to the host, not to the plugin: editing it does not reach a
running plugin, a newly installed plugin only enters the host inventory at server
start, and the montflow convention everywhere else is a store under
`.agents/@montflow/<domain>/` that the plugin's own CLI, TUI face, prompt, and
verifier share.

Move the configuration into `.agents/@montflow/model-fallback/config.json`, read
it at activation, re-read it on change so edits apply without restarting the host,
and add a `status` command that reports whether that file exists and matches the
expected shape — offline, without needing a live model catalog. Keep
`opencode.jsonc` options working as a fallback during migration so an existing
install keeps running.

## Requirements

- One owned store file: `.agents/@montflow/model-fallback/config.json`, created by the plugin's own tooling, never hand-managed by the host config.
- The file carries a version, an ordered `chain` of `provider/model` or `provider/model#variant` labels, and optional `triggers`. Unknown top-level keys are tolerated on read and preserved on write; unknown triggers and unparsable model labels are shape errors, not silent drops.
- Resolution order is store → `opencode.jsonc` `plugins[].options` → idle. The plugin logs which source it used. With neither present it stays inert and says how to configure it.
- The plugin reads the store at activation and watches it; a valid change takes effect on the next failure without restarting the host. An invalid change is rejected, the last valid configuration stays in force, and the rejection is logged with each shape issue.
- `status` is offline and answers "does this workspace have a valid configuration": store path, presence, source in force, chain, triggers, and every shape issue with its field. It exits non-zero only when a file exists but is invalid, so an unconfigured workspace still passes a check gate.
- `verify` keeps its live meaning — store shape plus every chain model resolving against the catalog — and fails when the catalog cannot be reached.
- `show`, `set`, and `remove` write only the store; the CLI migrates an existing `opencode.jsonc` `plugins[].options` block into the store when asked (`migrate`), leaving the plugin entry with no options afterwards.
- One schema owns the shape, used by the plugin, the CLI, and the verifier: the same bytes produce the same verdict everywhere.
- The prompt and README describe the store path and the status/verify split; the plugin's root gate check covers the store's shape.
- Existing behavior is unchanged: trigger defaults, no-wrap chains, per-session tried-set, the retry-hook switch, and the resume path.
- Every execution task passes its `GATES.md`, and the phase ships with tests for the shape matrix and for store-vs-options precedence.

## Tasks

| ID | Name | Type | Status | Gates |
| --- | --- | --- | --- | --- |
| A001 | decide-config-store-contract | planning | complete | No |
| A002 | implement-config-store | execution | complete | Yes |
| A003 | add-status-check | execution | complete | Yes |
| A099 | review-phase | review | complete | No |
