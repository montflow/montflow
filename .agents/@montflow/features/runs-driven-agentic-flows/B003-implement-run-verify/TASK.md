---
id: B003
name: implement-run-verify
type: execution
originator: user
depends-on: B002
related-tasks:
status: complete
---

# Task B003: Implement mechanical run verification

## Type: execution

## Description

Add `verifyRun` to `@montflow/pi-runs`, mirroring `PiProfiles.verifyProfileFile`
and `PiFeatures.verifyFeatureFile`: a pure check over a run directory that
reports `{ valid, issues }` and a `resumable` verdict. Resume must refuse a run
that fails verification.

Checks:

- `run.md` frontmatter decodes; `id` matches the directory; status/updated/created present.
- `session.jsonl` lines decode; `seq` starts at 1 and is strictly monotonic; roles valid.
- Receipt consistency: terminal status ⇔ receipt present; outcome matches status.
- Resumability: no receipt, status `running`/`awaiting-input`, every event replayable (raw `message` or synthesizable text).
- No traversal / unknown extra files that break ownership.

## Requirements

- Pure function(s) + `verifyRun` Effect wrapper; no writes.
- Issues are field-scoped and human-readable, like the profile/feature verifiers.
- `Store.load`/resume refuses invalid runs with the issue list.
- Unit tests for each failure class.

## Completion

- [ ] Implementation matches the A004 contract
- [ ] Tests pass (`bun run --cwd packages/pi-runs test`)
- [ ] Output summarized in MEMORY.md
