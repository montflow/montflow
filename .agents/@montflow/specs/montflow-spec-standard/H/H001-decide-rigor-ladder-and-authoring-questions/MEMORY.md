# Memory

## Context
- H001 (planning, write-scope: none, depends-on B003): decide the five-level rigor ladder, the authoring question flow, and the isolation worktree recipe; supersede B003 without editing it.
- Read: phase brief, TASK.md, G001 contract, B003 record, tier module + tiers payload, spec-create prompt, sizing module, `using-git-worktrees`. H/ has no BOARD.md and this task no MAILBOX.md.
- Decision: the spec-level concept `tier` becomes `rigor` (user-owned; B003's was appraiser-owned). Level names stay `trivial, light, standard, deep, critical` — the user's vocabulary, all size-free; only the frozen split grammar keeps its field name `tier`.

## Progress
- 2026-11-04: decided the matrix, ownership/escalation, question flow, worktree recipe, persistence, and supersession list; no product or spec-state edit. Self-checked against TASK.md `## Completion` and the profile's receipt list.

## Findings
### F1 — Ladder (one source: `RIGORS` + `RIGOR_CONTRACT`)
| rigor | phases | exploration | tasks total/per phase | gate | review · waiver | ask_user | grilling |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `trivial` | 1–1 | forbidden | 2/2 | command-per-task | waived · permitted | 0 | forbidden |
| `light` | 1–1 | optional | 4/4 | per-task | waived · permitted | 1 | not-loaded |
| `standard` | 1–2 | optional | 6/4 | per-task | required · records-only | 2 | not-loaded |
| `deep` | 2–3 | required | 9/5 | phase-and-task | required · records-only | 4 | required |
| `critical` | 2–4 | required | 12/6 | phase-and-task | required · forbidden | 8 | required |
- Exploration: `optional` = at most one exploratory **task** in phase A only; `deep`'s `required` = one exploratory task in phase A and later phases `depends-on` it; `critical`'s `required` = dedicated exploration **phase A**, later phases depend on it; `forbidden` = none, so a request needing discovery is not `trivial`.
- Gates: `command-per-task` = every file-changing task names ≥1 command (prose-only invalid); `per-task` = every task names ≥1 command, or one named subjective check for planning/exploratory/review (empty invalid); `phase-and-task` = per-task plus one recorded mechanical run of the affected suite before each phase review round.
- Waiver: `permitted` = appraiser may waive any phase and may upgrade one, never forced; `records-only` = may waive only a phase whose tasks are all planning/exploratory/review, with a recorded reason (enforced by `init`/`waiver`/`effectiveWaiver`); `forbidden` = never waives.
- Artifacts — required: all five carry `SPEC.md`, `PHASE.md`, `TASK.md`, `MEMORY.md`, `GATES.md`; `standard`/`deep` add `review-task` + `BOARD.md`; `critical` adds `MAILBOX.md`. Conditional: `review-task` when a `trivial`/`light` phase is upgraded to `required`; `BOARD.md` + `MAILBOX.md` when a `light` phase holds >1 concurrent task; `MAILBOX.md` when a `standard`/`deep` phase holds >1 concurrent task.
- `init`/`new-task` refuse an over-ceiling plan (phase count, total/per-phase tasks, exploration placement, gate kind, waiver policy); never "just this once".

### F2 — The user owns rigor; the appraiser only advises
- The authoring form asks `rigor` first (required select, five options, no default); the run loads that level, then appraises the request against it. The appraiser may recommend another level and **must flag** a request the chosen level cannot hold, but never overrides the user.
- Over ceiling: stop before authoring; re-appraise once at the smallest level that holds; one escalation question (counts against the `ask_user` budget). Accept → record `rigor: <new> (raised-from <old>)`; decline or budget exhausted → author nothing and record `unresolved: <level> cannot hold: <n> tasks / <reason>`. Independent concerns → `split` (F7); one concern above `critical` → `stopped: above-ceiling`, never a sixth level.
- Ownership split: **rigor** owns phases, exploration, task ceilings, gate kind, review default, waiver policy, artifacts, and questions; **size** owns dispatch targets and per-phase review-cycle budgets. No rigor file, table, contract, or prose may name a size, model, effort, or review-cycle count; the drift test bans those tokens.

### F3 — Exact question flow (`request`, `notes` keep their first positions)
| # | name | label | type | options | default | required | `when` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `request` | Spec request | textarea | — | — | yes | always |
| 2 | `notes` | Extra constraints | textarea | — | `""` | no | always |
| 3 | `rigor` | Rigor | select | `trivial,light,standard,deep,critical` | — | yes | always |
| 4 | `isolated` | Isolated worktree? | select | `yes,no` | — | yes | always |
| 5 | `origin` | Worktree origin | select | `current,main,other` | — | yes | `isolated=yes` |
| 6 | `origin_branch` | Origin branch | text | — | — | yes | `origin=other` |
| 7 | `worktree_name` | Worktree name | text | — | — | yes | `isolated=yes` |
- `—` means no default (required + default is forbidden by G001). Names match `[a-zA-Z_][a-zA-Z0-9_]*`; the task's hyphenated `origin-branch`/`worktree-name` are invalid and never used.
- Guards name the conditional child, never a controller: `{{#if origin}}…{{#if origin_branch}}…{{/if}}…worktree name {{worktree_name}}{{else}}current checkout; no branch/worktree{{/if}}`; never `{{#if isolated}}`. `rigor` and `isolated` render unconditionally.

### F4 — Worktree recipe (delegated to `using-git-worktrees`; the prompt never runs `git worktree add`)
- Load the skill first and follow its Step 0. Already in a linked worktree (`GIT_DIR != GIT_COMMON`, not a submodule): create nothing, author in the current workspace, pass `--workspace-type worktree`, record the existing path; `origin`/`worktree_name` are unused.
- `current` = checked-out branch (`git branch --show-current`); detached HEAD = `BASE=HEAD` (branch created at finish). `main` = `git fetch origin main`, then `BASE=origin/main`, never a stale local `main`. `other` = `origin_branch`: fetch `origin`, prefer `origin/<name>` when it verifies, else `<name>`, always `git rev-parse --verify`; never guess.
- Branch/path: `BRANCH=feat/<worktree_name>` (a prefix stated in `notes` wins); name must be kebab-case `^[a-z0-9]+(-[a-z0-9]+)*$` and unique; path `.worktrees/feat/<worktree_name>` (existing `worktrees/` wins; verify ignored, add + commit `.gitignore` if not). Sandbox denial = work in place and report.
- Push: never by default; `git push -u origin "$BRANCH"` only when the request or `notes` asks.
- Handoff: the skill reports `Worktree ready at <abs-path>`; make it the run's workspace root (all generator paths resolve there), run `mf-specs init --workspace-type worktree` (or `create`), and record `workspace: <abs-path>` in the final line. No new path flag: `--workspace-type` only writes the frontmatter.

### F5 — Persistence
- Store `rigor: <level>` in the `SPEC.md` `## Creation` body (with `questions <n>/<budget>`, `unresolved:`), never in frontmatter and never in `PHASE.md`. It is provenance for audit; no verifier reads it, so absence/legacy never errors and a second copy cannot drift.
- Execution never consults rigor: `PHASE.md` `review` is the sole review decision and a lock derives from tasks + gates + that decision/waiver. The ladder is authoring-time only. Final run line: `rigor · workspace · <phases>/<tasks> · questions n/budget · authored|split|stopped · unresolved`.
- Legacy B003 `tier:` lines stay inert; no backfill, no finding.

### F6 — Supersession (frozen records are not edited)
- B003 F1/F3/F4: enum + matrix replaced by F1; `TIERS/Tier/TIER_CONTRACT/TIER_HINT/isTier` → `RIGORS/Rigor/RIGOR_CONTRACT/RIGOR_HINT/isRigor` in `packages/specs/src/modules/rigor/`; `tierOrUndefined` → `rigorOrUndefined`; `waiverAllowed` spans five levels. B003 F5: `SPLIT_FIELDS` unchanged; its part field keeps the frozen name `tier` and takes one of the five values.
- B003 F6/F7: files become `packages/specs/rigors/<level>.md` (5), installed `.agents/@montflow/rigors/`; verb `mf-specs rigor <level>`, host `/specs rigor`, tool `spec_rigor`; doctor paths `shippedRigorDir/File`, `installedRigorDir/File`, `SPEC_RIGOR_NAMES`, payload kind `rigor`; drift test moves to `rigor/tests/drift.test.ts` with six legs over five files plus a question-flow leg (required select, 5 options, no default); embedded-payload const renamed.
- C006: replace the three `packages/specs/tiers/{micro,standard,full}.md` with the five `rigors/*.md`, delete the `tiers/` payload dir; rewrite `spec-create.json` (variables F3; steps user-rigor → appraise/advise → load rigor → isolate → author; sizing step byte-identical); appraiser verdict names the user-chosen rigor + recommendation and never overrides; creation-orchestrator loads `mf-specs rigor <level>`; skill table heading `Rigor`, five rows, size section untouched; `prompt.test.ts:89-90` inversion kept.
- `init --tier` → `--rigor`; `## Creation tier:` → `rigor:`; `new-phase`/`new-task` read `RIGOR_CONTRACT`; `create`/`scaffold` keep `--workspace-type` only. No completed record edited; `.agents/@montflow/tiers/` becomes an unlisted orphan the doctor leaves alone. No existing spec gains a finding: nothing verifies `rigor` or `tier`.

### F7 — Split boundary (B003 F5 verbatim, nothing added)
- Only above `critical`. Fields exactly `verdict, cut, count, specs, slug, tier, scope, evidence`; `count ≥ 2` equals `specs`, unique kebab slugs, every part level valid, no nested part above `critical`, `cut` names a repo seam, `evidence` lists the two forcing facts; the orchestrator authors nothing, reports `split · count <n> · cut <seam>`, stops.
- Volume alone never splits: a 40-file mechanical rename in one concern stays `critical`; an over-ceiling single concern with no independent seam stops as `above-ceiling`, never a sixth level.

## Gates
- None: planning task; no gate command, no test/typecheck/lint/build, no log, no repo-wide check.

## Open Questions
- None blocking. The frozen split grammar's `tier` field is the only surviving `tier` token; renaming it later is a wire-format change with its own decision.

## Handoff
- H002: rename/extend the module and ship five payload files + the drift test per F1/F6; keep legacy `tier:` records inert.
- H003: rewrite the prompt per F3/F4/F5 — variables, guards, worktree delegation, `## Creation`; leave the sizing section unchanged.
- H004: wire CLI/flag/verb/host tool/profile/skill/doctor/embedded names per F6; no size restatement.

## Deviations
- No `claim`, stamp, or status verb was run, to keep spec state unchanged; the dispatch already bound this task. No BOARD/MAILBOX existed to read. Only this `MEMORY.md` was written.
