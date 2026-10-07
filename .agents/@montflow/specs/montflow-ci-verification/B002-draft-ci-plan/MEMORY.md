# Memory

## Context

Task B002: convert the B001 decisions into a concrete, ordered implementation
plan for Phase C. Revised after the B099 adversarial review (15 findings) and
to match the code already landed by C001/C002.

## Progress

- 2026-10-07: complete (revised after B099 review).

## Findings

### Root scripts (C002 — implemented)

| Script | Command |
| ------ | ------- |
| `verify:montflow:skills` | `bun run --cwd packages/pi-skills cli verify --dir $PWD && bun run --cwd packages/pi-skills cli doctor --check --dir $PWD` |
| `verify:montflow:prompts` | `bun run --cwd packages/pi-prompts cli verify --all --dir $PWD/.agents/@montflow/pi-prompts && bun run --cwd packages/pi-prompts cli doctor --check --dir $PWD` |
| `verify:montflow:specs` | `bun run --cwd packages/pi-specs cli check --dir $PWD/.agents/@montflow/specs` |
| `verify:montflow:profiles` | `bun run --cwd packages/pi-profiles cli --dir $PWD` |
| `verify:montflow:runs` | `bun run --cwd packages/pi-runs cli doctor` |
| `verify:montflow:extensions` | the five above, fail-fast |
| `verify:montflow:fast` | `turbo lint:check && turbo format:check && turbo ts:check` + `verify:montflow:extensions` |
| `verify:montflow` | `verify:montflow:fast` + `turbo test` |

`mf-skills doctor` and `mf-prompts doctor` gained `--dir` (C001) so they target
the repo root rather than the package cwd.

### Extension verifies (C001 — implemented)

- `mf-prompts verify --all`: `PromptStore.readAllRaw` enumerates every raw
  `*.json` without decoding; `Engines.verifyAll` verifies each. It does **not**
  use `list`, closing A099 F1. Tested against a store with an unparseable file.
- `mf-profiles` (new binary + `cli` script): `verifyAll` reads every
  `*/PROFILE.md` without decoding. `--dir <root>` targets a repo.

### CI workflow (C003)

`.github/workflows/verify.yml`, name `Verify`:

- `on: push: branches: [main]`; top-level `permissions: {}`; `contents: read`
  on the job; `concurrency: { group: verify-${{ github.ref }, cancel-in-progress: true }`;
  `timeout-minutes: 15`.
- One matrix job; each cell repeats the release.yml per-job preamble (checkout,
  setup-bun `1.3.13`, cache `~/.bun/install/cache` keyed on `bun.lock`,
  `bun install --frozen-lockfile`). There is **no** separate `setup` job — it
  would have no outputs and its cache is not shared across runners (release.yml
  documents this).
- `strategy.fail-fast: false`; `name: ${{ matrix.target }} (${{ matrix.script }})`.
- Matrix `include` (label → exact script, never a bare `lint`/`typecheck`):

  | target | script |
  | ------ | ------ |
  | lint | `lint:check` |
  | format | `format:check` |
  | typecheck | `ts:check` |
  | test | `test` |
  | skills | `verify:montflow:skills` |
  | prompts | `verify:montflow:prompts` |
  | specs | `verify:montflow:specs` |
  | profiles | `verify:montflow:profiles` |
  | runs | `verify:montflow:runs` |

- Header comment: `release.yml` keeps its own publish-candidate conditions and
  is intentionally untouched; also records the push-to-main-only limitation.

### Hook (C004)

- `lefthook` pinned devDependency; `lefthook.yml` running only `pre-push`:
  `bun run verify:montflow:fast`.
- `hooks:install`: `lefthook install`.
- Under this layout lefthook writes the **shared common** hooks dir
  (`git rev-parse --git-path hooks` = `.bare/hooks`), so a sibling worktree
  without `lefthook.yml`/the script can fail; the hook command degrades by
  checking for `package.json`/the script before running. `core.hooksPath`
  stays unset.
- `git push --no-verify` and `LEFTHOOK=0` bypass.

### Doctor freshness scope

- `mf-skills doctor --check` and `mf-prompts doctor --check` do byte-freshness
  against the package payload.
- `mf-specs doctor` and `mf-runs doctor` are **presence-only installers** (they
  copy the skill when missing and never compare). Freshness for those two
  skills is not checked today; recorded as a follow-up. `mf-skills verify`
  still schema-validates the installed bytes.

### Release boundary (C005)

`release.yml` is not modified. Boundary documented in `verify.yml`'s header.

### Docs (C006)

`AGENTS.md` verification section: `verify:montflow` / `verify:montflow:fast`;
`hooks:install`; `--no-verify`. Per-extension verify commands documented.

### Accepted/won't-fix from B099

- `test:tui` (`apps/workspace`) and `fixtures:check` (`pi-specs`) are not wired
  into the gate; `test:tui` is a follow-up, `fixtures:check` is superseded by
  `packages/pi-specs/src/apps/cli/tests/fixtures.test.ts` under `turbo test`.
- Push-to-main-only is an accepted limitation (B001 decision 1).
- `verify:montflow:fast` keeps `turbo ts:check` (whole-repo `tsc --noEmit` per
  package, the slowest non-test step). Cost accepted for correctness over
  sharding by changed package; measured ~2s wall on this machine, so it is not
  a hook-latency problem.

## Open Questions

- Whether the CI matrix should also shard by workspace package (cost vs attribution) — left to C003.

## Handoff

- Feeds B099 review-phase.

## Deviations

- Implemented per-target scripts, the profiles binary, prompts `readAllRaw`,
  and `doctor --dir` during C001/C002 rather than only planning them, so the
  plan now documents the landed shape.
