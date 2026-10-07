---
name: montflow-project-structure
status: in-progress
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-06
locked-phases: A, B
---

# Montflow project structure

## Description

The rules for structuring a TypeScript project are spread across many
disconnected skills. The structural core (`typescript-conventions`,
`typescript-file-structure`, `typescript-modules`, `setup-typescript-package`),
the Effect scaffolding skills (`effect-services`, `effect-structs`,
`effect-testing`, `effect-v4`), the code-principle skills
(`typescript-prefer-inference`, `typescript-result-over-throws`,
`applying-solid`, `favoring-composition`, `detecting-duplication`,
`simplifying-code`, `leaving-it-cleaner`), and the docs/convention helpers
(`writting-jsdoc`, `mimicking-conventions`) each carry a slice of the story,
with no single entry point that tells an agent how a TypeScript project should
be structured end-to-end.

First, investigate what the current rules actually are and where they overlap,
conflict, or leave gaps. Then interview the user to decide what the rules
should really be and what everything should be called. The end goal is one
unified entry-point skill that **depends on** the individual skills rather than
duplicating their content — but the implementation is intentionally left
open-ended until the user decides the contract in Phase B.

## Requirements

- Phase A inventories every TypeScript-structure-relevant skill and extracts its rules, overlaps, gaps, and conflicts.
- The inventory covers the structural core, Effect scaffolding, code principles, and docs/conventions helpers named in the description.
- Phase A ends with a synthesis: a rule matrix, the natural dependency graph between skills, and a candidate shape for the unified entry point.
- Phase B interviews the user to decide the canonical rules, scope boundaries, and naming (skill name, groups, modules, spec naming).
- Phase B converts the interview into a concrete unified-skill contract plus an ordered outline of the implementation tasks to be authored later.
- The eventual unified skill is a single entry point that depends on the individual skills; it must not restate their content.
- The eventual unified skill must satisfy the pi-skills schema and the montflow skill-authoring rules.
- Phases A and B modify no skill or source files — they produce findings and decisions only.
- Implementation tasks are deliberately not authored until Phase B concludes; this spec is expected to grow after Phase B.

## Tasks

| ID   | Name                        | Type        | Status  | Gates |
| ---- | --------------------------- | ----------- | ------- | ----- |
| A001 | explore-structural-core     | exploratory | complete | No    |
| A002 | explore-effect-scaffolding  | exploratory | complete | No    |
| A003 | explore-code-principles     | exploratory | complete | No    |
| A004 | explore-docs-conventions    | exploratory | complete | No    |
| A005 | synthesize-current-rules    | exploratory | complete | No    |
| A099 | review-phase                | review      | complete | No    |
| B001 | interview-unified-contract  | planning    | complete | No    |
| B002 | draft-unified-skill         | planning    | complete | No    |
| B099 | review-phase                | review      | complete | No    |
