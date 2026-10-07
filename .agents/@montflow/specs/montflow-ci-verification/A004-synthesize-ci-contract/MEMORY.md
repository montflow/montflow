# Memory

## Context

Task A004: synthesize A001–A003 into a check matrix, a candidate CI + hook
shape, and the open decisions Phase B must put to the user.

## Progress

- 2026-10-07: complete (revised after A099 review).

## Findings

### Rule matrix

| Check             | Command                                                                 | Cost | Today                  | CI  | Hook |
| ----------------- | ----------------------------------------------------------------------- | ---- | ---------------------- | --- | ---- |
| install           | `bun install --frozen-lockfile`                                         | med  | release setup          | yes | no (assumes installed) |
| test              | `turbo test`                                                            | high | release packages only  | yes | yes* |
| `test:tui`        | `bun run --cwd apps/workspace test:tui`                                 | low  | none                   | ?   | ?    |
| typecheck         | `turbo ts:check`                                                        | med  | release packages only  | yes | yes  |
| lint              | `turbo lint:check`                                                      | med  | release packages only  | yes | yes  |
| format            | `turbo format:check`                                                    | low  | release packages only  | yes | yes  |
| skills verify     | `mf-skills verify --dir "$PWD"`                                         | low  | none                   | yes | yes  |
| skills freshness  | `mf-skills doctor --check` (needs repo root as cwd)                     | low  | none                   | yes | yes  |
| prompts verify    | per-file `mf-prompts verify <name> --dir <store>`                       | low  | none                   | yes | yes  |
| prompts freshness | `mf-prompts doctor --check` (needs repo root as cwd)                    | low  | none                   | yes | yes  |
| specs check       | `mf-specs check --dir "$PWD/.agents/@montflow/specs"`                   | low  | none                   | yes | yes  |
| runs freshness    | `mf-runs doctor` (repo-root aware)                                      | low  | none                   | yes | yes  |
| profiles verify   | `/mf-profiles-cli verify <name>` over `pi --mode rpc`                   | high | none                   | ?   | ?    |

\* whether the hook runs the full test suite (slow) or a fast subset is a
Phase B decision.

**Prompts gate constraint (A099 F1):** `list` / `list --status invalid` is an
enumerator with a fixed exit 0 that silently drops undecodable files. The gate
must enumerate raw `*.json` and call `verify <name>` per file, or `mf-prompts`
must gain a `verify --all`.

### Overlap with `release.yml`

`release.yml`'s `checks` job duplicates test/typecheck/lint/format, but only for
packages about to be published, and it is skipped when there is nothing to
release. Two resolutions:

1. **Delegate:** `release.yml` calls the shared entry point (or a `--filter`
   variant) instead of its own matrix; the verification workflow covers
   everything else.
2. **Gate on Verify (requires a concrete mechanism):** a job cannot `needs:` a
   job in a different workflow. To make `release` wait for the verification
   workflow, use either a `workflow_run` trigger on `Verify` (note:
   `workflow_run` runs with **write** defaults unless permissions are narrowed,
   and two workflows on the same push otherwise run concurrently) or a required
   `Verify` status check on `main` via branch protection. Both must be named
   explicitly; without one, removing `checks` would let `release` publish on a
   failing push.

Either removes the duplication and closes the gap. The `release` job must keep
its publish steps, tokens, and OIDC untouched.

### Candidate CI shape

- New workflow `.github/workflows/verify.yml` (name: `Verify`), trigger
  `push: branches: [main]` (PR scope is a Phase B decision).
- `permissions: { contents: read }`; `concurrency` on workflow+ref;
  `timeout-minutes: 15`.
- One `setup` job installs with `--frozen-lockfile` and the pinned bun version,
  caching `~/.bun/install/cache` keyed on `bun.lock` (mirrors `release.yml`).
- A `verify` job that runs the shared entry point **once** (`bun run verify`).
  If per-check attribution or sharding is wanted instead, define per-check
  sub-scripts (`verify:lint`, `verify:format`, `verify:ts`, `verify:test`,
  `verify:extensions`)
  and have each step call its own — a single `verify` script called from N
  steps would re-run the whole gate N times. Pick one; do not mix.

### Cost of the alternative matrix

A per-package attribution matrix would run over the 14 script-bearing
workspaces (13 `packages/*` plus `apps/workspace`; `tooling/*` define no
scripts) × 4 checks = **56 jobs/installs**. The single-step-list option is one
job.

### Candidate shared entry point

Root script `verify` running, in order and failing fast:

1. `turbo lint:check`
2. `turbo format:check`
3. `turbo ts:check`
4. `turbo test`
5. extension verifications (skills + doctor, prompts per-file, specs, runs;

   profiles optional)

Possibly split as `verify:extensions` so CI can shard and the hook can skip the
slow test step. Exact names are a Phase B decision.

### Candidate hook

`.githooks/pre-push` (mode `100755`) → `bun run verify` (or `verify:fast`),
installed with `git config core.hooksPath .githooks` behind a `hooks:install`
script. A missing or non-executable hook fails open, so CI remains the backstop.

### Open decisions for B001

1. Trigger scope: push to `main` only, or also `pull_request`.
2. Job layout: single `bun run verify` step vs per-check sub-scripts vs
   per-package matrix (attribution vs cost).
3. Does the push gate include the full test suite (`turbo test` and `test:tui`),
   or a fast subset?
4. Hook gate scope: same as CI, or lint/format/typecheck/extensions only.
5. Hook mechanism: `core.hooksPath` (recommended) vs husky/lefthook.
6. Auto-install the hook via a `prepare` script, or one documented command?
7. `release.yml`: delegate its checks, or gate `release` on `Verify` via
   `workflow_run`/required status check, or remove them?
8. Shared script names and granularity (`verify`, `verify:lint`, `verify:format`, `verify:ts`, `verify:test`, `verify:extensions`, `verify:fast`).
9. Profiles verification: include it (RPC) or declare it out of scope for now.
10. Whether to fix `doctor --check` (skills/prompts) to accept `--dir`/repo root,
    and/or add `mf-prompts verify --all`.

## Open Questions

- All ten decisions above are Phase B's.

## Handoff

- Feeds A099 review-phase.

## Deviations

- None.
