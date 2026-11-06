---
id: A003
name: add-status-check
type: execution
originator: planner:A001
size: none
depends-on: A002
related-tasks:
status: complete
---

# Task A003: Add the status check

## Type: execution

## Description

Add the offline answer to "is this workspace configured correctly": `status`
reports presence and shape without a live model catalog, and the root gate uses
it so a malformed store cannot land.

## Requirements

- `mf-model-fallback status [--json] [--dir <path>]` reports the store path, whether it exists, the source in force, the chain, the triggers, and every shape issue with its field and a fix hint.
- Exit codes: `0` for a valid store and for a workspace with no store at all (unconfigured is not invalid), `1` for a store that exists but is malformed, so the same command works as a gate and as a user report.
- `--json` returns the same facts as data, with an `ok` boolean and an `issues` array, stable enough for an agent to branch on.
- Shape coverage: malformed JSON, non-object document, wrong version, missing or empty chain, non-string entries, unparsable `provider/model` label, unknown trigger, duplicate model, and unknown-key tolerance.
- `verify` stays the live-catalog variant and its message points at `status` when the shape is the problem.
- Extend the root gate script so `status --check --dir $PWD` runs with the plugin's other checks, and the repo's own workspace passes it.
- Update README and the prompt with the `status` versus `verify` split.
- Tests cover the exit-code matrix, each shape issue, `--json` stability, and a legacy `opencode.jsonc`-only workspace.

## Completion

- [x] `status` command with text and JSON output
- [x] Exit-code matrix implemented and documented
- [x] Shape issues named per field with fix hints
- [x] Root gate runs the check and the workspace passes it
- [x] Tests and docs added
- [x] All gates in `GATES.md` pass
