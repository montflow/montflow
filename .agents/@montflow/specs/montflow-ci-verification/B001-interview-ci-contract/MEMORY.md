# Memory

## Context

Task B001: interview the user to settle triggers, job layout, the hook
mechanism, shared script names, and the `release.yml` boundary, reacting to the
A004 matrix and the A099 review (13 findings resolved, F14 fixed).

## Progress

- 2026-10-07: complete.

## Findings

### Decisions

| # | Decision | Choice | Rationale (user) |
| --- | --- | --- | --- |
| 1 | Trigger scope | **Push to `main` only** | "only trigger on main for now" |
| 2 | CI layout | **A matrix of per-artifact verify jobs** (skills, prompts, specs, profiles, plus the repo checks) | "CI should be like a matrix where we have a verify for a lot of things … prompts, profiles, skills, all of this" |
| 3 | Gate contents | **CI = full gate; hook = fast subset** (no full `turbo test`) | "Probably a fast subset is better" |
| 4 | Hook mechanism | **Lefthook** | "Let's use Left Hook" |
| 5 | Hook install | **One documented command** (`hooks:install` wrapping `lefthook install`) | "command for the number six" |
| 6 | `release.yml` | **Keep as is** — different conditions and verifications | "Keep release as is" |
| 7 | Shared entry point | **`verify:montflow`** (plus `verify:montflow:fast` and `verify:montflow:extensions`) | "should be like verify:montflow or something like that" |
| 8 | Profiles verification | **Include** — but first ensure the extension has a headless verify | "defer … [but] we need to make sure all extensions have a verify" |
| 9 | Extension verify gaps | **Every artifact-owning extension must expose a runnable verify**: prompts needs `verify --all` (the `list` enumerator false-greens — A099 F1), profiles needs a headless verify (currently RPC-only) | "we need to make sure all extensions have a verify" |
| 10 | `doctor --check` cwd gap (skills/prompts) | Keep for the fast gate, wrapped by the shared entry point so it runs with the repo root as cwd | implied by decision 9 |

### Phase C shape (supersedes the original generic tasks)

- C001 `add-extension-verify-commands` — add `mf-prompts verify --all` (or fix `list` to surface undecodable files) and a headless profiles verify, so every artifact-owning extension has a gate-runnable verify.
- C002 `add-verification-entrypoint` — root scripts `verify:montflow`, `verify:montflow:fast`, `verify:montflow:extensions`.
- C003 `add-ci-workflow` — push-to-main matrix of per-artifact verify jobs + repo checks.
- C004 `add-pre-push-hook` — Lefthook config running the fast subset, one documented install command.
- C005 `verify-release-boundary` — confirm `release.yml` is untouched and document the boundary in `verify` workflow comments.
- C006 `document-verification` — document the gate, the hook install, and the extension verify commands.
- C007 `conformance-and-changelogs` — run the whole gate, add changelogs.
- C099 `review-phase`.

### Deferred / open

- Whether the CI matrix shards by workspace package as well as by artifact
  class (cost vs attribution) is left to C003.
- Lefthook runs on every hook by default; the config must scope `pre-push`
  only (plus leave `pre-commit` unset) to avoid surprises.
- Profiles verify will require either a small headless entry (C001) or an RPC
  driver in CI; C001 prefers the headless entry.

## Open Questions

- None blocking; the two deferrals above are recorded for Phase C.

## Handoff

- Feeds B002 draft-ci-plan.

## Deviations

- The generic C004 `reconcile-release-workflow` is replaced by
  `verify-release-boundary` (C005) because the user chose to keep `release.yml`
  unchanged; C002/C003/C004 are renumbered accordingly.
