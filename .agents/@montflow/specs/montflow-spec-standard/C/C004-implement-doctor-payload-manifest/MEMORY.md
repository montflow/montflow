# Memory

## Context

C004 implements the B005 payload contract: one `payload.json` per package, one
shared `@montflow/payload` compare/install engine, one shared embedded-payload
generator replacing the six per-package copies, and an explicit split between
repair (`doctor`) and report-only (`doctor --check`) for every `mf-*` CLI.
C004 ships the `skill`, `profile`, and `prompt` kinds; the `tier` kind is
implemented and fixture-tested, with the three real tier files and entries
deferred to C006. No `mf-sessions` package exists at HEAD and none was created.

## Progress

- 2026-11-02: read TASK/GATES/MEMORY, the B005 decision, all seven doctor
  modules and generators, the root scripts, and the package wiring.
- 2026-11-02: added `packages/payload` (`@montflow/payload`): manifest
  validation/reading, the one compare/install engine, the one embed generator,
  and tests. New workspace dependency wired with `bun install`.
- 2026-11-02: added `payload.json` to skills, prompts, specs, profiles, reviews,
  references, and model-fallback; seeded `packages/profiles/profiles/` with the
  six shipped profiles; added `files` arrays and the shared generator scripts;
  deleted the six per-package generators.
- 2026-11-02: rewrote every doctor on the shared engine; added
  `mf-profiles doctor` (binary and `/mf-profiles-cli doctor`); kept the specs
  prompt validator as the package-specific hook; mapped references' payload
  checks onto the shared result while leaving its scaffolding checks intact.
- 2026-11-02: root scripts: `mf-profiles:check` now ends with
  `doctor --check`; new `mf:doctor` repairs all seven payload packages.
- 2026-11-02: tests updated to the unified status vocabulary (`ok | missing |
  stale | mismatched | blocked` in check; `present | installed | repaired |
  blocked` in repair) and the "extras are user data" rule; added profiles doctor
  tests and the compiled-binary test.
- 2026-11-02: proved `mf:check` write-free, the clean-clone repair, and the
  fast gate. Details under Findings.

## Findings

### Architecture landed

- `packages/payload/src/modules/manifest/manifest.module.ts` — `PAYLOAD_KINDS`,
  `PayloadEntry`/`PayloadManifest`, `loadManifest(raw, package)` (Schema-decoded;
  rejects malformed, empty, duplicate, escaping, wrong-root, and wrong-stem
  entries), `namesOf`, `nameAt`, `entriesOf`, `expectedTarget`, `INSTALL_ROOT`.
- `packages/payload/src/modules/install/install.module.ts` — `runPayloadDoctor`
  with `resolvePayload` (package bytes first, embed second), atomic temp+rename
  writes, symlinked-tree `blocked` in both modes, `mismatched` for a missing
  packaged file, extras never drift and never deleted, check mode performing no
  `makeDirectory`/write at all, and the F6 message (`artifact name` + `Fix:
  Reinstall ... then run ...` for blocked; `Run: <invocation>` for repairable).
- `packages/payload/src/modules/embed/embed.module.ts` —
  `generateEmbeddedPayload({ packageRoot, manifest, output })`; every package
  keeps a thin `scripts/generate-embedded-payload.ts` and writes the same
  `EMBEDDED_PAYLOAD` shape (all four kind buckets, flat file maps).
- Every doctor is now a thin adapter: manifest-derived names, package roots,
  invocation/subject, and an optional file validator. `SPEC_SKILL_NAMES` /
  `SPEC_PROMPT_NAMES` / all `SKILL_NAMES` / `PROMPT_NAMES` are derived; no
  payload name array remains.

### Manifest kinds covered

| Kind | Real manifest entries at C004 | Proof |
| --- | --- | --- |
| `skill` | skills 2, prompts 2, specs 2, reviews 2, references 2 | install/check/compiled tests |
| `profile` | profiles 6 | profiles doctor tests + compiled test |
| `prompt` | specs 3, model-fallback 1 | install/check/compiled tests |
| `tier` | none (C006 owns the 3 files + entries) | fixture manifest + generator test |

`packages/specs/prompts/` remains the canonical prompt home; the specs manifest
points at it and there is no second copy.

### Repairs and reports

- Missing/stale/mismatched payloads print their artifact name and
  `Run: mf-<tool> doctor`; a blocked payload prints its code, problem, and the
  concrete `Fix:` (reinstall the owning package, then run its doctor).
- One blocked payload never aborts the rest of the run; the aggregate exits
  unhealthy.
- A manifest that does not load is a `blocked` `doctor.manifest-missing` run,
  never an empty success.

### Gate evidence (all commands run from repo root)

| Command | Exit | Key output |
| --- | --- | --- |
| `bun run mf:check` (before/after `git status --porcelain`) | 0 | `✓ no live Pi-era names (1928 files)`; `summary checks=8 failed=0 repaired=0`; `git status` identical before/after |
| `bun run ts:check` | 0 | `Tasks: 17 successful, 17 total` |
| `bun run lint:check` | 0 | `Tasks: 17 successful, 17 total` |
| `bun run fmt:check` | 0 | `Tasks: 17 successful, 17 total` |
| `bun run mf:gate:fast` | 0 | lint + fmt + ts + mf:check all pass; final `summary checks=8 failed=0 repaired=0` |
| `bun run --cwd packages/payload test` | 0 | `Test Files 10 passed (10)`, `Tests 50 passed (50)`; compiled-binary test builds all seven CLIs and repairs + re-checks each from the embed |
| `bun run --cwd packages/skills test` | 0 | 46 files, 417 tests passed |
| `bun run --cwd packages/prompts test` | 0 | 50 files, 599 tests passed |
| `bun run --cwd packages/reviews test` | 0 | 24 files, 160 tests passed |
| `bun run --cwd packages/model-fallback test` | 0 | 66 files, 361 passed / 1 skipped |
| `bun run --cwd packages/profiles test` | 0 | 40 files, 192 tests passed |
| `bun run --cwd packages/specs test` | 0 | 102 files, 1451 tests passed |
| `bun run --cwd packages/references test` | 1 | 389 passed, 1 unrelated failure in `src/modules/git/tests/lifecycle.test.ts` (`ref-mismatch` expected, `present` received); no C004 file involved. Every references doctor/CLI test passes |
| `bun run --cwd packages/references test src/apps/doctor/tests src/apps/cli/tests/binary.test.ts` | 0 | 6 files, 88 tests passed (the references payload/doctor/CLI surface) |

### Clean-clone repair proof

```
cp -a <repo> /tmp/opencode/c004-clean/repo        # working tree, node_modules, no .git
rm -rf .agents/skills .agents/@montflow/prompts .agents/@montflow/profiles
bun run mf:doctor                                  # exit 0: installed 8 skills, 3 prompts, 6 profiles, model-fallback
for p in skills prompts specs profiles reviews references model-fallback; do
  bun run --cwd packages/$p cli doctor --check --dir "$PWD"   # all exit 0
done
```

All 20 manifest targets compared `diff -r` against this checkout:
`identical=20 different=0` (`skill`, `profile`, and `prompt`; tier deferred).

### Compiled binaries

`packages/payload/src/modules/install/tests/compiled-binary.test.ts` builds one
binary per package with a manifest (`skills`, `prompts`, `specs`, `profiles`,
`reviews`, `references`, `model-fallback`), runs repair then `--check` in a
fresh temp workspace, and asserts both exit 0 with no "not usable" line. Passes
in ~1.9 s. No `mf-sessions` target.

## Open Questions

1. **References full suite has one unrelated failure.** `GitLifecycle sync >
   repairs a stale origin/HEAD after an upstream default-branch rename` fails
   in this environment with `present` instead of `ref-mismatch`; it touches
   `packages/references/src/modules/git/`, which C004 did not change. The
   doctor/CLI tests all pass. Flagged for the orchestrator/C001 review rather
   than edited here.
2. **Seeded profile formatting.** Two of the six seeded `PROFILE.md` copies
   (`spec-bookkeeper`, `spec-execution-orchestrator`) were not oxfmt-clean. I
   formatted the canonical copies and the corresponding installed
   `.agents/@montflow/profiles/*/PROFILE.md` copies so `fmt:check` and
   `mf:check` are green; C006 will rewrite all six to the v2 vocabulary anyway.
   The doctor reports all six healthy.
3. **No real tier files.** Correct for C004 per B005: `packages/specs/payload.json`
   intentionally has no `tier` entries; C006 adds the three files and entries
   together.

## Handoff

- **C006** — add `packages/specs/tiers/{micro,standard,full}.md` and their three
  `tier` entries to `packages/specs/payload.json`, then run
  `bun run --cwd packages/specs generate:payload` and `bun run mf:doctor`.
  Rewrite the six canonical files in `packages/profiles/profiles/` to the v2
  vocabulary, regenerate the profiles embed, and repair the installed copies.
  The prompts stay canonical in `packages/specs/prompts/`.
- **C007** — document the manifest, the repair/report split, `mf:doctor`, the
  F6 message, the `tier`/`profile` ledger rows, and that extras are user data.
- **C008** — the profiles slash surface now accepts `doctor [--check] [--dir]`;
  keep it in the parity list. `/specs` parity for the new verbs is still C008.
- Any new package with a `doctor` must add a `payload.json`, a generator script,
  a `files` array, an `mf-<tool>:check` cell using `doctor --check`, and an
  `mf:doctor` entry; the manifest and root-script tests enforce both directions.

## Deviations

- **`PayloadInstall.kind` is optional.** The engine always sets it; making it
  optional kept several existing test fixtures (which build a status literal
  without a kind) typechecking. Renders/filters read it only through the
  engine's kind buckets.
- **References payload checks are mapped, not delegated verbatim.** The shared
  engine owns install/compare, but references' eight named checks and its
  `verifyPackagedSkills` pass stay package-specific per B005; the mapping
  preserves `skills-installed` / `skills-current` output, including the
  `extra file(s)` note and the standard-skill validation.
- **`mf:doctor` hardcodes `$PWD`**, like every existing root `mf-*:check` cell.
  The clean-clone proof runs it from the copied repo root, which is the intended
  "fresh workspace" use.
- **No status, lock, SPEC.md, or other task's file was edited.** Only this
  `MEMORY.md` was written under the task directory.
