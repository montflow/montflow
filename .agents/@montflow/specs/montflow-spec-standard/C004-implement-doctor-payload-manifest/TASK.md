---
id: C004
name: implement-doctor-payload-manifest
type: execution
originator: planner:B005
size: medium
depends-on: B005, A002, A003
related-tasks: C006
status: pending
---

# Task C004: implement doctor payload manifest

## Type: execution

## Description

Main already ships a doctor in every package with its own embedded payload copy.
One manifest of payload kinds per package replaces the hardcoded name arrays, the
per-package generators collapse into one shared generator, and
diagnose-and-repair and report-only become explicit so verification never writes.

## Requirements

- A per-package payload manifest covering every artifact kind the package ships, skills, profiles, prompts, and tier files, read by repair mode, report-only mode, and the verify scripts.
- Report-only mode reaches parity across all packages, and every `mf-<tool>:check` script uses it, closing the defect where one script repaired during CI while its siblings reported.
- One shared embedded-payload generator replaces the six per-package copies (`generate-embedded-skills.ts` ×4, `generate-embedded-prompts.ts`, and the specs generator) and is wired into each package build, so a compiled `mf-specs` or `mf-sessions` keeps a working doctor instead of failing on a nonexistent payload directory.
- The profiles package, which still ships no installable payload, gains one; the prompts package's shipped spec prompts stay in `packages/specs/prompts` and gain a manifest entry rather than a second copy.
- A stale or missing payload is reported with its artifact name and the repair command, and a fresh repair of a clean clone produces the same tree this repo has.
- The pre-push fast gate still passes without the test suite.

## Completion

- [ ] `bun run mf:check` passes and writes nothing during the run, proven by a clean `git status` afterward
- [ ] A clean workspace gains every payload kind from one repair command and then re-reports healthy
- [ ] Each package compiled binary reports healthy payload status
- [ ] Tests cover stale, missing, mismatched, and never-writes-in-report-only
