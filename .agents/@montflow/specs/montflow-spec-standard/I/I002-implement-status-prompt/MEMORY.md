# Memory

## Context

Implement I001's read-only `spec-status` prompt as a shipped doctor payload:
template, manifest entry, doctor ownership, embedded payload, installed copy,
docs, and tests. I003 wires binary/slash/host later.

## Progress

- 2026-11-05: added `packages/specs/prompts/spec-status.json`; variables
  `name` (required, `source: specs`) then optional `focus`; ten ordered report
  sections, five terminal lines, read-only boundary, `spec-execute` handoff.
- Registered the prompt in `payload.json`, `SPEC_PROMPT_NAMES` (index 3),
  `rerunOf`, doctor/prompt CONTEXT docs, README, and wiki payload table.
- Regenerated `embedded-payload.generated.ts`; doctor installed
  `.agents/@montflow/prompts/spec-status.json` byte-equal to the package file.
- Added `status-prompt.test.ts` (verify, variables, sections, terminal lines,
  focus, inconsistent/complete renders, installed bytes, boundary, picker
  source) and updated doctor/prompt test counts for the fourth prompt.

## Findings

- Report contract follows I001 exactly: sections 1-4 from `state`, 5-6 from
  `status`, 7 from `next`, 8 from `check` + `state`, 9 from
  `review decide --json` (fallback `status`), 10 from the terminal table.
- Read-only test asserts no command token for `subagent`, `spec_status`,
  `claim`, `gate run`, `gate record`, `stamp`, `waiver`, or git mutation; the
  boundary forbids writes, status/lock edits, dispatch, and git changes.
- Whole-store `mf-specs check` reports pre-existing `gate.stale-result` issues
  in F002/H002/H003 (F002 scope untouched here); not caused by this task and
  out of write scope. Scoped suites, prompt verification, and doctor are clean.

## Gates

- `bun run --cwd packages/specs test -- src/modules/prompt src/modules/doctor`
  → 18 files, 250 tests, 0 type errors (log `/tmp/I002.log`).
- `bun run --cwd packages/prompts cli verify spec-status --dir "$PWD"` →
  `✓ 'spec-status' matches the standard format.`
- `bun run --cwd packages/prompts cli verify --all --dir "$PWD"` →
  `6 prompts · 0 issues · 0 warnings`.
- `bun run --cwd packages/specs cli doctor --check --dir "$PWD"` → all payloads
  `up to date`, including `spec-status`.
- `bun run --cwd packages/specs format:check` / `lint:check` / `ts:check` → clean.
- `bun run --cwd packages/specs cli check --dir "$PWD"` → 14 specs, 1 failed
  (pre-existing stale gate results above), 6 issues, 17 warnings.

## Open Questions

- None. I003 owns `status-report`, `/specs status-report`, and `spec_status`.

## Handoff

- I003 reuses this prompt through the new `status-report` binary/slash engines
  and the `spec_status` tool; no prompt or payload change should be needed.

## Deviations

- Docs describe the prompt and its `/mf-prompts` render path; they do not claim
  the status binary/slash/host surfaces before I003 wires them. `rerunOf` names
  the agreed `mf-specs status-report` command as required by the task.
