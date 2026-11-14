---
id: C004
name: implement-doctor-payload-manifest
type: execution
originator: planner:B005
size: medium
depends-on: B005, A002, A003
related-tasks: C006
status: complete
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
- One shared embedded-payload generator replaces the six per-package copies (`generate-embedded-skills.ts` ×4, `generate-embedded-prompts.ts`, and the specs generator) and is wired into each package build, so the compiled binary of every package with a manifest keeps a working doctor instead of failing on a nonexistent payload directory. There is no `mf-sessions` package at HEAD; do not invent one.
- The profiles package, which still ships no installable payload, gains one; the prompts package's shipped spec prompts stay in `packages/specs/prompts` and gain a manifest entry rather than a second copy.
- The `tier` payload kind is implemented and fixture-tested here; C006 adds the three real tier files and manifest entries. C004's completion covers only the kinds C004 ships (`skill`, `profile`, `prompt`).
- A stale or missing payload is reported with its artifact name and the repair command, and a fresh repair of a clean clone produces the same tree this repo has.
- The pre-push fast gate still passes without the test suite.

## Completion

- [x] `bun run mf:check` passes and writes nothing during the run, proven by a clean `git status` afterward
- [x] A clean workspace gains every payload kind C004 ships (`skill`, `profile`, `prompt`) from one repair command and then re-reports healthy; the `tier` kind is proven by a fixture, with its three real files deferred to C006
- [x] The compiled binary of every package with a manifest reports healthy payload status (no `mf-sessions` target)
- [x] Tests cover stale, missing, mismatched, and never-writes-in-report-only
