# Memory

## Context

Task A002: enumerate every extension verification command, its headless
behaviour, and its baseline against this workspace. Commands were run through
the sanctioned `bun run --cwd <pkg> cli …` scripts (never raw binaries).
Baselines are point-in-time snapshots taken 2026-10-07 and drift as artifacts
are added or removed — treat pass/fail, not the counts, as the stable signal.

## Progress

- 2026-10-07: complete (revised after A099 review).

## Findings

### Per-command table

| Surface            | Invocation                                                                 | Headless | Baseline (2026-10-07, snapshot)                |
| ------------------ | -------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| skills (all)       | `bun run --cwd packages/pi-skills cli verify --dir "$PWD"`                  | yes      | pass, exit 0                                   |
| skills (one)       | `… cli verify <name> --dir "$PWD"`                                          | yes      | n/a                                            |
| skills freshness   | `… cli doctor --check`                                                      | partial  | exit 1 — reports the *package* store (cwd note) |
| prompts (one)      | `bun run --cwd packages/pi-prompts cli verify <name> --dir "$PWD/.agents/@montflow/pi-prompts"` | yes | `commit` ✓, `effect-review` ✓, exit 0 |
| prompts (all)      | `… cli verify <name>` for every raw `*.json` in the store                   | yes      | 2 prompts; no invalid                           |
| prompts enumerator | `… cli list [--status invalid] --dir <store>`                              | yes      | exit 0 always — see the flaw below              |
| prompts freshness  | `… cli doctor --check`                                                      | partial  | exit 1 — reports the *package* store (cwd note) |
| specs              | `bun run --cwd packages/pi-specs cli check --dir "$PWD/.agents/@montflow/specs"` | yes  | pass, exit 0                                   |
| specs doctor       | `… cli doctor` (no `--check`)                                               | no       | writes skills; not a verification              |
| profiles (one)     | `/mf-profiles-cli verify <name>` over `pi --mode rpc`                       | no       | fails non-zero on an invalid profile           |
| profiles (all)     | `/mf-profiles-cli list --status invalid` over `pi --mode rpc`               | no       | 5 profiles; see count below                    |
| runs freshness     | `bun run --cwd packages/pi-runs cli doctor`                                 | yes      | checks/installs the dispatch skill             |

### The prompts enumeration flaw — do not trust `list`

`PromptStore.list` decodes every `*.json` with
`Schema.decodeUnknownSync(Prompts.FromJson)` and silently drops anything that
throws; the source comment states that files the store cannot decode are never
listed, with or without a filter. Independently reproduced: a store containing
`goodshape.json` (valid JSON, missing required fields) and `corrupt.json` (not
JSON) yields `list` → "No prompts yet." and `list --status invalid` → "No
prompts with status 'invalid'.", both exit 0, while `verify goodshape` and
`verify corrupt` each fail with exit 1.

Consequences:

- `list` is an **enumerator with a fixed exit 0** and can never be the failing
  step; only `verify <name>` fails.
- Using `list --status invalid` to drive the gate false-greens on exactly the
  corrupted artifacts it exists to catch.
- "Verify all prompts" must enumerate raw `*.json` filenames and call
  `verify <name>` per file, propagating each exit code — or the CLI must gain a
  `verify --all` / surface undecodable files as `invalid`.

### `--dir` semantics differ per package — critical

- **skills** `--dir` = workspace *root*; the store is `<dir>/.agents/skills`.
  `--dir "$PWD"` from the repo root is correct.
- **prompts** `--dir` = the *store directory itself*
  (`.agents/@montflow/pi-prompts`). Passing the repo root silently reports
  "No prompts yet" (exit 0) — a false green.
- **specs** `--dir` = the *specs directory*
  (`.agents/@montflow/specs`).
- **profiles** is a slash command only; it has no `--dir` flag.

### `doctor` is cwd-relative — except runs

`mf-skills doctor` and `mf-prompts doctor` resolve `<cwd>/.agents/skills`.
Invoked via `bun run --cwd packages/<pkg> cli`, the child cwd is the package
directory, so `--check` reports the package's own store
(`packages/pi-skills/.agents/skills/…`) as missing — not this repo's
`.agents/skills`. There is currently **no sanctioned way** to run these
freshness checks against the repo root except a root script that invokes the
package module with the repo root as cwd. `mf-specs doctor` has no `--check`
flag at all and installs rather than verifies.

`mf-runs doctor` is the exception: it resolves the repo root by walking
ancestors for a `.git` entry, so `bun run --cwd packages/pi-runs cli doctor`
correctly targets `<repo>/.agents/skills/montflow-dispatch-pi-runs`. The cwd
caveat therefore applies to the skills and prompts doctors only.

### Profile count

`.agents/@montflow/profiles/` holds **5** profiles
(documentation-reviewer, effect-reviewer, generic-reviewer,
language-quality-reviewer, pattern-consistency-reviewer). `TEMPLATE.md` is a
file, not a profile.

### Headless gaps

- Profiles verification needs a Pi session (`pi --mode rpc`), which CI would
  have to spawn. The per-name `verify <name>` action fails non-zero on an
  invalid profile and is the profile analogue of `mf-skills verify <name>`.
- `mf-prompts verify` is strictly per-name; see the enumeration flaw above.

## Open Questions

- Whether profiles verification is in scope for CI, given the RPC requirement.
- Whether to add `--dir` (or a repo-root fix) to the skills/prompts `doctor`
  commands, or to add a root script that supplies the repo root.
- Whether to add `verify --all` to `mf-prompts` (or make `list` surface
  undecodable files).

## Handoff

- Feeds A004 synthesize-ci-contract.

## Deviations

- None.
