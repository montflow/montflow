# Memory

## Context
- H004 (execution, write-scope: packages/specs, depends-on H003): wire `mf-specs author`, `/specs author`, and `spec_author` to the five authoring answers with the same validation and hidden-branch behaviour as `/mf-prompts`.
- Read: phase brief, TASK.md/GATES.md, H001 decision, scoped CLI/server sources, tests, and `packages/specs/prompts/spec-create.json`. No phase BOARD.md and no H004 MAILBOX.md exist.
- The dispatch already bound this task; no `claim`/status verb was run, so spec state is unchanged.

## Progress
- Audited the H003 follow-up wiring: five flags on the binary, the slash flag table, and the `spec_author` schema; hidden gating; per-kind validation; model-free render. Implementation already satisfied the requirements; the gap was proof.
- Added the missing behaviour tests in one batch; no production source change was needed.
- Full evidence: `/tmp/H004.log`.

## Findings
- Binary (`cli.author.inputs.ts`) validates request, rigor (five), isolated (yes/no), origin (current/main/other), kebab-case worktree name, and non-empty origin branch only when `origin=other`; it attaches `origin`/`worktree_name` only for `isolated=yes` and `origin_branch` only for `origin=other`. Hidden answers are dropped, never required.
- Slash (`cli.slash.module.ts` + `cli.slash.parse.module.ts`) maps `--origin-branch`/`--worktree-name` into the shared engine, so its diagnostics are identical.
- Tool (`spec-tools.apps.module.ts`) exposes `rigor`, `isolated`, `origin`, `originBranch`, `worktreeName` and calls the same engine before dispatching.
- Test gap closed: all five rigor levels, origins `current`/`main`, hidden branch drop, every refusal (request/rigor/isolated/origin/worktree/origin-branch) with flag, accepted values, actual, and rerun, no-git-mutation, `/mf-prompts` fill parity, and tool/slash parity against the binary text.
- `AUTHOR_RERUN` stays the repo-standard placeholder rerun (`--request <text> ...`); every refusal prints it as `next`.

## Gates
- Scoped suite `bun run --cwd packages/specs test -- src/apps/cli/tests/author-execute.test.ts src/apps/cli/tests/run-slash.test.ts src/apps/server/tests/spec-tools.test.ts`: exit 0, 6 files, 246 tests passed, no type errors.
- `bun run --cwd packages/specs ts:check`: exit 0.
- `bun run --cwd packages/specs lint:check`: exit 0 (only Node module-type warnings from the config loader).
- `bun run --cwd packages/specs format:check`: exit 0, 303 files formatted.
- Official gate, `mf:check`, and `mf:gate` deliberately not run; orchestrator owns them.

## Open Questions
- None.

## Handoff
- Orchestrator can run the task gate and close H004. The binary remains model-free and mutates no git state (asserted by the HEAD/`.worktrees` test).

## Deviations
- Consumed the existing dispatch binding instead of calling `claim`. No TASK.md checkbox, status, SPEC.md, PHASE.md, board, or mailbox edit.
