# Memory

## Context
- H003 rewrites the shipped `spec-create` prompt, the `spec-creation-orchestrator` profile, and `montflow-create-specs` for H001's rigor/isolation question flow; reconciled the task text with H001/G001 (names `origin_branch`/`worktree_name`, verb `rigor`).
- Read: phase brief, TASK/GATES, H001/G001 records, prompt module + tests, prompt JSON, creation profile, create-specs skill, `using-git-worktrees`.

## Progress
- 2026-11-04: rewrote `spec-create.json` (7 variables, `when` guards), extended the profile and skill (question table + isolated authoring), added render/order/doctor-byte tests and two drift legs, bumped the skill to 2.19.0 with a changelog entry, regenerated embedded payloads, and repaired the `.agents` mirrors. No spec state edited.
- 2026-11-04 (follow-up): wired `rigor`/`isolated`/conditional origin answers through `mf-specs author`, `/specs author`, and `spec_author`, with coded refusals for absent or invalid values; updated the three entrypoint suites. Full package suite is green.

## Findings
- Prompt variables in first-appearance order: `request`, `notes`, `rigor`, `isolated`, `origin`, `origin_branch`, `worktree_name`; `rigor` is a required five-option select with no default, `isolated` yes/no, `origin` current/main/other (`isolated=yes`), `origin_branch` (`origin=other`), `worktree_name` (`isolated=yes`). No guard names a controller.
- Template names `Chosen rigor` first, loads `mf-specs rigor {{rigor}}` once, never chooses/upgrades/defaults, and reports mismatch, one escalation, or split per H001.
- Isolated render loads `using-git-worktrees`, passes origin/branch/name, authors with `--workspace-type worktree`, never runs `git worktree add`, never nests; the in-place render carries no origin/worktree token.
- Profile and skill give the rigor choice to the user; the appraiser recommends and flags only. The skill's 7-row question table matches the prompt; the drift test parses that table and the profile's order sentence.
- Doctor installs the embedded payload, so regeneration and a doctor repair were required for the byte-equality tests; both packages report `doctor --check` clean.
- `author()` validates `request`/`rigor`/`isolated` and, when isolated, `origin`/`worktree_name`/`origin_branch` once with `cli.invalid-argument` diagnostics, and passes only visible branch keys. `--rigor`, `--isolated`, `--origin`, `--origin-branch`, and `--worktree-name` are wired on the binary, slash form, and host tool.
- The validation moved to `cli.author.inputs.ts` because `cli.author.module.ts` crossed the structure test's 1000-line cap; the module re-exports it, so no barrel change was needed.

## Gates
- `bun run --cwd packages/specs test -- src/modules/prompt` -> 178 passed, exit 0.
- `... test -- src/modules/rigor` -> 18 passed, exit 0; `... src/modules/doctor` -> 53 passed, exit 0.
- `bun run --cwd packages/specs ts:check` -> exit 0; `lint:check` -> exit 0; `format:check` -> exit 0.
- `bun run --cwd packages/profiles test` -> 202 passed, exit 0; `lint:check`/`format:check` -> exit 0.
- `bun run --cwd packages/specs cli doctor --check --dir "$PWD"` -> up to date, exit 0; profiles doctor --check -> up to date, exit 0.
- `bun run --cwd packages/specs test` (full package, phase-complete proof) -> 144 files, 2153 tests passed, exit 0.
- Full log: `/tmp/H003.log`.

## Open Questions
- None.

## Handoff
- H004 receives the author flags already wired on the binary, slash form, and `spec_author`; it keeps only the remaining naming/entrypoint work from its own task.
- The author surfaces now require `rigor` and `isolated`; an absent flag is `cli.invalid-argument` (field `--rigor`), never `prompt.missing-variable`.
- The prompt keeps `notes` optional and routes every value through the G003 conditional resolver; hidden answers are dropped, never rendered.

## Deviations
- Ran `generate:payload` and `doctor` for both packages, which rewrote the generated embedded payloads and the `.agents` mirrors outside `packages/*`; required for the prompt/doctor byte tests and `doctor --check`. No other files outside the write scope changed.
- No `claim`/stamp/status verb was run; the dispatch bound this task and the return must leave spec state unchanged. `TASK.md` was not edited.
- Added `cli.author.inputs.ts` (author validation extracted) so `cli.author.module.ts` stays under the structure test's 1000-line cap; the module re-exports it.
