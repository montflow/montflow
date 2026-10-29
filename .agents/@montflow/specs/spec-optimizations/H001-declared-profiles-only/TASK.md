---
id: H001
name: declared-profiles-only
type: execution
originator: user
size: tiny
depends-on: G004
related-tasks:
status: complete
---

# Task H001: declared-profiles-only

## Type: execution

## Description

The shipped authoring artifacts name a repo-specific reviewer profile.
`spec-create` §5 and the authoring skill both say "declare `effect-reviewer` on
every code phase — any phase holding an `execution` or `defect` task", so a
package installed into another repo prescribes a profile that repo may never have
declared, and a rename, docs, or config phase buys a second review series it does
not need. The CLI's profile-validation message uses the same slug as its example,
and six package tests use it as a fixture.

Make reviewer selection repo-local and a judgment about the phase's work.

## Requirements

- In `packages/specs/skills/montflow-create-specs/SKILL.md` step 4, replace the
  `reviewer-profiles` bullet: drop the task-type predicate and the
  `effect-reviewer` example. Tell the author to read the profiles the repo
  declares under `.agents/@montflow/profiles/` and declare one only when its
  focus matches the phase's work; state that an empty list is the default and is
  valid on every phase, and that each declared profile adds one review round per
  cycle in that phase.
- Rewrite §5 of `packages/specs/prompts/spec-create.json` to the same rule, and
  say that `mf-specs create --reviewer-profiles` seeds only the review task of
  the one phase it scaffolds, never a spec-wide default.
- Replace the `effect-reviewer` example in the reviewer-profile validation
  message `mf-specs create` emits (`grep -rn "not a valid reviewer profile"
  packages/specs/src`) with a slug that names no real profile.
- Sweep every package test that uses `effect-reviewer` as a fixture
  (`create`, `scaffold`, `parse-task-file`, `verify-task-file`,
  `verify-spec-tree`, `review-link`) to a neutral `example-reviewer` fixture;
  the assertions stay as they are.
- Add one sentence to the README multi-reviewer section: profiles are declared by
  the repo and optional per phase, and nothing in the package recommends one.
- Regenerate `src/apps/doctor/embedded-payload.generated.ts`, run
  `mf-specs doctor` so the workspace skill matches byte for byte, and keep
  `mf:check:skills`, `mf:check:prompts`, and `mf:check:specs` green.
- Change no behavior beyond the validation message text, edit no record under
  `.agents/@montflow/specs/`, and leave historical CHANGELOG entries as written.

## Completion

- [ ] `grep -rn effect-reviewer packages/specs` prints nothing outside `CHANGELOG.md`
- [ ] The prompt and skill state the discovery-and-judgment rule and the per-profile round cost
- [ ] The workspace skill equals the package skill after `mf-specs doctor`
- [ ] Package test, lint, format, and typecheck pass
- [ ] `mf:check:skills`, `mf:check:prompts`, and `mf:check:specs` pass
