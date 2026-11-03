# Memory

## Context

Finish the manual-check audit D001 started. The remaining gaps were in the
prompt, profile, review, and discovery skills: each scanned or self-checked by
hand while `mf-prompts verify`, `mf-profiles verify`, `mf-reviews create` /
`resume`, and `mf-skills list` already answer.

## Progress

- 2026-11-03: implemented all Stage 0/1 changes.
- `montflow-create-prompts` 3.1.0: `mf-skills list` / `show` for discovery,
  `mf-prompts verify <name>` mandatory on create and modify, seven rules kept as
  the explanation of what verify checks.
- `montflow-create-profiles` 1.3.0 / `montflow-modify-profiles` 1.2.0:
  `mf-skills list` discovery, `mf-profiles verify <name>` mechanical gate,
  GATES.md and the subjective checklist retained.
- `montflow-adversarial-review` 5.2.0: round from `mf-reviews create` (next free
  round by default), `resume` for a re-review, `list --verbose` for discovery;
  explicit `- Round:` authoritative via `create --round <NNN>`; highest+1 rule
  removed.
- `finding-skills` 1.2.0 / `executing-skills` 1.2.0: `mf-skills list` first,
  explicit Glob/Grep fallback when the binary is unavailable.
- Regenerated prompts/reviews embedded payloads; `doctor` mirrored the workspace.
- Tests: prompts `skill-docs.test.ts`, reviews `skill-drift.test.ts`, skills
  `skill-docs.test.ts` extended; new profiles `skill-docs.test.ts`.

## Findings

- `mf-skills list` already prints id + description by default, so no `--verbose`
  flag is needed for discovery.
- `mf-reviews create` scaffolds and refuses to overwrite, so an explicit round
  that already exists is populated in place, not re-created.
- Profile skills have no package payload; `mf-profiles verify` checks them via
  the workspace store.

## Gates

- `bun run --cwd packages/specs test` — 1839 pass, exit 0 (GATES Stage 3).
- prompts/reviews/skills/profiles `test` — all pass, exit 0.
- `ts:check`, `lint:check`, `format:check` for the four packages — exit 0.
- `mf-skills verify` 46 skills 0 issues; `mf-profiles verify` 12 profiles 0
  issues; prompts `verify --all` 0 issues; reviews `verify --all` 0 issues.
- `doctor --check` silent for prompts, reviews, profiles, skills.
- Mutation proof: removing each CLI step fails its test (exit 1, restored).
- Full log: `/tmp/D002.log`.

## Open Questions

- The profile skills are workspace-only. If they later ship, add them to a
  package payload and doctor manifest; this task only updated workspace copies.

## Handoff

- D001 owns the spec-authoring profile discovery; `reviewer-profiles` untouched.
- E003 owns parallel-phase authoring; this task stayed on CLI-first verification
  and discovery.
- Orchestrator: tick TASK.md completion and run the official gate once.

## Deviations

- Added a new `packages/profiles/src/apps/cli/tests/skill-docs.test.ts`; the
  package had no existing skill-text test to extend.
