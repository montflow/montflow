---
id: H003
name: rewrite-spec-create-for-rigor-and-isolation
type: execution
originator: user
size: medium
depends-on: H002, G003, C006
related-tasks: H004
status: pending
---

# Task H003: rewrite spec-create for rigor and isolation

## Type: execution

## Description

Rewrite the shipped `spec-create` prompt so the user's authoring choices are the
first thing it carries: the rigor level, whether the authoring runs in an
isolated worktree/branch, and, when isolated, the origin and the worktree/branch
name. Use the G002/G003 conditional variables so a flat prompt never asks or
renders the hidden branch. Teach the creation orchestrator and the authoring
skill the same flow; the appraiser recommends, the user's rigor wins.

## Requirements

- Rewrite `packages/specs/prompts/spec-create.json` with the H001 question flow
  in first-appearance order: `request`, `notes`, `rigor`, `isolated`, `origin`,
  `origin-branch`, `worktree-name`. `rigor` is a required five-option select
  with no default; `isolated` is a required `yes`/`no` select; `origin` is a
  required `current`/`main`/`other` select visible only when `isolated` is
  `yes`; `origin-branch` is required and visible only when `origin` is `other`;
  `worktree-name` is required and visible only when `isolated` is `yes`. Every
  conditional uses G001's `when` form and the template guards match it.
- The template names the chosen rigor in the first screen, then instructs the
  run to load exactly that tier file through `mf-specs tier <value>` and apply
  its matrix. It must never choose, upgrade, or silently default the rigor; if
  the request cannot fit the chosen level, it re-appraises and reports the
  mismatch instead of raising the level itself.
- The isolated branch loads `using-git-worktrees`, passes the chosen origin and
  worktree/branch name, authors inside the resulting worktree with
  `workspace-type: worktree`, and never runs `git worktree add` directly or
  nests a worktree when the run is already isolated. The non-isolated branch
  keeps today's in-place behaviour. The final line reports rigor, isolated or
  in-place, the origin when isolated, and the worktree path/branch.
- Update the `spec-creation-orchestrator` profile and the packaged
  `montflow-create-specs` skill to the same flow: the user selects rigor, the
  orchestrator does not; the appraiser recommends and flags an under-selected
  level; the isolated branch delegates to `using-git-worktrees`; the skill's
  question table and the prompt cannot drift.
- Update the prompt render tests: isolated `no` omits every origin/worktree
  token; isolated `yes` includes origin and name; `origin: other` includes the
  freeform branch; a hidden variable never appears; the declared variables stay
  in first-appearance order; the doctor payload matches the packaged bytes.
- A drift test fails when the prompt, the skill, the profile, or the tier table
  disagree about the five rigor names or the question flow.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] The rendered prompt with `isolated: no` contains no origin or worktree token
- [ ] The rendered prompt with `isolated: yes` carries origin and worktree/branch
- [ ] `origin: other` carries the freeform origin branch and nothing else does
- [ ] The prompt delegates worktree creation to `using-git-worktrees` and uses `workspace-type: worktree`
- [ ] The profile, skill, and prompt agree on the five names and the question order
- [ ] `mf-specs doctor` and the prompt tests are green
