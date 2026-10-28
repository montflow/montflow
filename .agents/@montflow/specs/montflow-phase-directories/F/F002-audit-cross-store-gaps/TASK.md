---
id: F002
name: audit-cross-store-gaps
type: exploratory
originator: planner:E099
depends-on: E099
related-tasks: A001
status: complete
---

# Task F002: audit cross-store gaps

## Type: exploratory

## Description

The layout changed the store every other consumer reads. The phase-A inventory
covered `packages/specs`, `apps/workspace`, and the skill copies; this audit
checks the rest of the workspace for a remaining flat-layout assumption or a
stale sentence before the change is announced as done.

## Requirements

- Sweep the repo (excluding `node_modules`, `dist`, `.git`) for the old shape:
  path literals matching `[A-Z]{1,2}\\d{3}-`, "one directory per task", a task
  directory at the spec root, and `locked-phases` prose that assumes no phase
  directory.
- Check at least: `packages/reviews` (tests and CLI), `packages/specs` wiki and
  prompt module, `apps/workspace`, every `.agents/skills/*`, `.agents/@montflow/*`
  prompts/profiles, the root `README.md`/`AGENTS.md`, and the five complete specs'
  MEMORYs for a layout claim that is now false.
- For each hit record: file and line, why it is stale, severity (breaks a gate,
  misleads an agent, cosmetic), and the owning task (new defect task or
  no-change with a reason).
- Exploratory: it produces the gap table. The only edits allowed are correcting a stale layout claim it finds, each recorded in MEMORY.md with its file. Do not edit code or docs beyond those inline corrections.
- Confirm no consumer outside the swept list imports `@montflow/specs` and reads
  snapshot paths.

## Completion

- [x] MEMORY.md holds one row per hit with file, severity, and owner
- [x] The sweep command and its exclusions are recorded so it can be re-run
- [x] Anything that breaks a gate is marked as such and named, even if no fix is authored yet
- [x] No file outside this spec changed
