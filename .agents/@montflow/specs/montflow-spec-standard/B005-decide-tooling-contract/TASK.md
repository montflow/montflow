---
id: B005
name: decide-tooling-contract
type: planning
originator: planner:A099
size: medium
depends-on: B003, B004, A002
related-tasks: A002
status: pending
---

# Task B005: decide tooling contract

## Type: planning

## Description

Define the verbs that replace the remaining hand-written mechanics, and the payload
and doctor contract that makes the profiles, prompts, and tier files installable
rather than hand-copied. Main already ships `state`, `next`, `author`, `execute`,
`sizing-config`, `models`, `which`, and a doctor in every package; this task decides
what is still missing, not a second set of those verbs.

## Requirements

- The missing generator verbs, at minimum `new-phase`, `new-task`, `stamp`, `init`, `claim`, `lock`, and `gate run`: for each, its arguments, what it writes, and what makes it fail. Confirm that main's shipped `state`, `next`, `author`, `execute`, `sizing-config`, `models`, and `which` are kept as-is or extended, never re-specified. State the rule that anything a verifier checks has a generator.
- `next` computes the ready set from derived state so no agent reasons about scheduling from a markdown table. `claim` binds a session to a task and is the only atomic status write.
- A per-package payload manifest of artifact kinds replacing the hardcoded name arrays, read by repair mode, report-only mode, and every verify script.
- Verb split between diagnose-and-repair and report-only, with report-only what CI uses. Decide whether a separate sync name is an alias, a root script, or absent, and say which CI and compiled-binary defects it fixes.
- Which packages ship which payload kinds, including the profiles and prompts this overhaul authored, and how a fresh clone obtains them.
- How doctor behaves when its payload is missing from an installed package: the message names the artifact and the repair command and never falls back to silence.

## Completion

- [ ] Verb list with signatures and write semantics recorded in MEMORY.md
- [ ] Manifest design, CI-safe verb split, and payload shipping plan decided
- [ ] Every defect named in A002 has an owning task in Phase C
