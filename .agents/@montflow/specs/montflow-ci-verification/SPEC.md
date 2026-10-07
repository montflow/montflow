---
name: montflow-ci-verification
status: complete
workspace-type: in-place
author: Daniel Montilla
created: 2026-10-07
locked-phases:
  - A
  - B
  - C
---

# Montflow CI verification

## Description

Today the only automated checks live inside `release.yml`, and they run only
for packages whose local version is not yet on npm. A push that touches a
package whose version is already published — an agent skill, a spec, a
workflow, a hook, a docs change — gets no lint, typecheck, format, or test
run, and the extension verification commands (`mf-skills verify`,
`mf-prompts verify`, `mf-specs check`, `mf-profiles verify`, `doctor`) run
nowhere at all. The same gap exists locally: nothing runs before a push
leaves the working copy.

Add a general verification gate for this repository: a GitHub Actions
workflow that runs on pushes to `main`, covering linting, formatting, type
checking, tests, and the extension verifications; and a pre-push hook that
runs the same gate locally so a failure surfaces before it reaches `main`.
CI and the hook share one entry point so they cannot drift.

## Requirements

- A GitHub Actions workflow runs on push to `main` and reports lint, format, typecheck, test, and extension-verification results.
- The extension verifications cover every artifact this repo owns — workspace skills, prompts, specs, and profiles — and the packaged-skill freshness checks (`doctor`).
- Every artifact-owning extension exposes a headless verify the gate can run; `mf-prompts` must not rely on `list` (it silently drops undecodable files and always exits 0).
- Each check is independently attributable: a failure names the package, skill, prompt, spec, or profile that failed, not just the workflow.
- A pre-push hook runs the same fast subset locally and blocks the push when any fails.
- The hook is installable from a clean clone in one documented command, without hand-editing `.git/config`, and works under this repo's bare-repo worktree layout.
- CI and the hook call one shared entry point (`verify:montflow` / `verify:montflow:fast`) rather than duplicating command lists.
- `release.yml` keeps its own conditions and verifications; the new workflow does not modify it, and the boundary is documented.
- No secrets, write permissions, or non-public services are required for the verification workflow.
- Phases A and B modify no file outside `.agents/@montflow/specs/`.

## Tasks

| ID   | Name                           | Type        | Status  | Gates |
| ---- | ------------------------------ | ----------- | ------- | ----- |
| A001 | explore-existing-ci            | exploratory | complete | No    |
| A002 | explore-extension-verifications | exploratory | complete | No    |
| A003 | explore-pre-push-hooks         | exploratory | complete | No    |
| A004 | synthesize-ci-contract         | exploratory | complete | No    |
| A099 | review-phase                   | review      | complete | No    |
| B001 | interview-ci-contract          | planning    | complete | No    |
| B002 | draft-ci-plan                  | planning    | complete | No    |
| B099 | review-phase                   | review      | complete | No    |
| C001 | add-extension-verify-commands  | execution   | complete | Yes   |
| C002 | add-verification-entrypoint    | execution   | complete | Yes   |
| C003 | add-ci-workflow                | execution   | complete | Yes   |
| C004 | add-pre-push-hook              | execution   | complete | Yes   |
| C005 | verify-release-boundary        | execution   | complete | No    |
| C006 | document-verification          | execution   | complete | No    |
| C007 | conformance-and-changelogs     | execution   | complete | Yes   |
| C099 | review-phase                   | review      | complete | No    |
