# Memory

## Context

- Task: **C006 — ship-skills-and-doctor** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Task read: `.../C006-ship-skills-and-doctor/TASK.md` (1–39) and
  `GATES.md` (1–18).
- Contract sources: B003 §1 (verb order), §2 (doctor flags), §3 (exact doctor
  agent grammar), §4 (exit contract), §5 (engine/renderer split), §7 (eight
  checks and the retired warning), §11 (skill fields and both pipelines), §12
  (lazy `@montflow/skills` verifier), §13.3 (`verify` vs `doctor`), §14
  (downstream obligations). B001 §11 and B002 §3.1/§4.4 were consumed through
  B003 §7/§13.3 and the existing C003 scaffold helpers (`hasIgnoreRule`,
  `appendIgnoreRule`, `GitPort.addForce`).
- Implementation consumed: C004's CLI stack (`engines`, `renderers`, `binary`,
  `slash`, fixtures) and C005's server/tools. Live precedent read end to end:
  `packages/reviews/skills/montflow-adversarial-review/*`,
  `packages/reviews/scripts/generate-embedded-skills.ts`,
  `packages/reviews/src/apps/doctor/**`,
  `packages/skills/src/apps/doctor/**`,
  `packages/skills/src/apps/cli/tests/skill-docs.test.ts`,
  `packages/skills/src/modules/skill/skill.module.ts` (`verifyStandardSkillFile`),
  `packages/profiles/src/modules/skill-check/skill-check.module.ts` (lazy import
  seam), and `.agents/skills/authoring-skills/SKILL.md` (groups taxonomy).
- Scope executed: only `packages/references/` and this `MEMORY.md`. No
  `.agents/skills/` change, no docs, no root scripts, no CI, no store entry, no
  `SPEC.md`/`TASK.md`/`GATES.md`/status/lock edit. `bun.lock` was already
  modified before this task and was not touched.

## Progress

Done, in order:

1. Authored both skills under `packages/references/skills/`:
   `montflow-add-reference` (groups `references`, `git`) and
   `montflow-find-reference` (groups `references`, `workflow`), each with the
   full frontmatter (`name`, `description`, `id`, `author`, `version`,
   `license`, `groups`, `dependencies: [executing-skills]`), the
   `# When To Use` / `# Pipeline` / `# Reference` body, and a `CHANGELOG.md`
   carrying the migration note. IDs generated once:
   `f9ecf21554e66e1b` (add), `02784d07a0e2c73f` (find).
2. Wrote `scripts/generate-embedded-skills.ts` (sibling pattern) and generated
   `src/apps/doctor/embedded-payload.generated.ts`; `build:cli` now runs the
   generator first, matching `packages/reviews`.
3. Replaced the doctor scaffold with the eight checks in B003 §7 order:
   `store-root`, `registry`, `clone-root`, `gitkeep`, `gitignore`,
   `skills-installed`, `skills-current`, `retired-skills`. `--check` reports
   only and never writes or spawns git. No check reads a clone.
4. Added the lazy `@montflow/skills` verifier to `skills-current`; an import
   failure is a failed check (not a skipped warning), and an installed copy
   that fails `verifyStandardSkillFile` is drift.
5. Added `Engines.doctor(root, {check, invocation})`, `Renderers.doctor(result,
   options)`, and `Renderers.gate`, then wired the ninth verb into the binary
   and slash trees with `--check --human --verbose --dir` and updated both usage
   strings/descriptions (doctor first).
6. Added 14 doctor/skill tests plus a payload-drift/standard suite, and extended
   the renderer/slash/binary tests. Total package suite: 276 tests.
7. Mapped every Stage 0/1 checkbox to a named test or command below, and ran the
   full gate set.

## Findings

### 1. What was built

| File | Change |
|---|---|
| `skills/montflow-add-reference/SKILL.md` | add pipeline, routed-add notice rule, CLI surfaces, no registry table |
| `skills/montflow-add-reference/CHANGELOG.md` | `1.0.0` + retired-name migration note |
| `skills/montflow-find-reference/SKILL.md` | resolve/list/show/sync/report pipeline, `reference_find` note |
| `skills/montflow-find-reference/CHANGELOG.md` | `1.0.0` + retired-name migration note |
| `scripts/generate-embedded-skills.ts` | new generator, `SKILL_NAMES` local list |
| `src/apps/doctor/embedded-payload.generated.ts` | generated payload (2 skills, 9942 bytes) |
| `src/apps/doctor/doctor.apps.module.ts` | eight checks, `runDoctor`, `readPayload`, `doctorGateMessage` |
| `src/apps/doctor/tests/run-doctor.test.ts` | install/repair/stale/mismatch/ignore/gitkeep/invalid/no-clone/check tests |
| `src/apps/doctor/tests/embedded-payload.test.ts` | payload drift, standard verifier, changelog version, table/CLI contract |
| `src/apps/cli/engines.apps.module.ts` | `doctor` engine over `DoctorApp.runDoctor` |
| `src/apps/cli/renderers.apps.module.ts` | `doctor`, `gate`, doctor usage line, human table |
| `src/apps/cli/binary.apps.module.ts` | ninth subcommand, first in the tree |
| `src/apps/cli/slash.apps.module.ts` | `Doctor` action, parser case, run case, description/usage |
| `src/apps/cli/tests/{renderers,slash,binary}.test.ts` | doctor output, parse/run/exit wiring |
| `package.json` | `build:cli` runs the generator first (sibling parity) |

### 2. Doctor behaviour

- **Order and statuses.** Checks run in the fixed order above. A check is `ok`,
  `repaired`, or `drifted`. `healthy` is true unless a check is `drifted`; a
  repair leaves `healthy: true` and the aggregate `status: 'repaired'`.
  `--check` turns every would-be repair into `drifted`, so the same workspace
  exits 1 and writes nothing.
- **Registry.** Delegates to `Verifier.verifyStore` over a `ReferenceStore.scan`
  snapshot — the same CI-safe pass as `verify`, no clones, no network. Detail is
  `issues=<n> [warnings=<n>]` followed by `<entry> [<field>] <message>` per
  issue, so an invalid entry names both its `REFERENCE.md` and the failing field.
- **Scaffolding.** Clone root, `.gitkeep`, and the ignore line reuse C003's
  one predicate and appender (`hasIgnoreRule`, `appendIgnoreRule`), so `add` and
  `doctor` cannot duplicate or disagree. A recreated `.gitkeep` is staged with
  `git.addForce` only in repair mode and only when `<root>/.git` exists.
- **Skills.** `skills-installed` writes missing skills from the package
  directory, falling back to the embedded payload. `skills-current` compares the
  full file set, rewrites stale/payload-missing files, reports extras
  (`extra file(s): …`) without deleting them, and verifies the installed
  `SKILL.md` with the lazy `@montflow/skills` standard verifier.
- **Retired warning.** `adding-references`/`finding-references` presence is an
  `ok` check with `warning: true`; it never changes `healthy` or the exit code
  and names both retired names plus a working `git rm -r` command for those
  present.
- **No clones.** No check depends on a clone existing, so a tarball checkout is
  healthy after scaffolding repair and a zero-clone workspace never fails.

### 3. Gate output, verbatim

```text
$ bun run --cwd packages/references generate:payload
$ bun run scripts/generate-embedded-skills.ts
wrote ./src/apps/doctor/embedded-payload.generated.ts — 2 skills, 9942 bytes of payload
```

```text
$ bun run --cwd packages/references test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/reference-plugin/packages/references


 Test Files  28 passed (28)
      Tests  276 passed (276)
Type Errors  no errors
   Start at  16:11:20
   Duration  2.79s (import 66%, tests 28%, transform 3%, typecheck 2%)
```

```text
$ bun run --cwd packages/references ts:check
$ tsc --noEmit
```

(no output, exit 0)

```text
$ bun run --cwd packages/references lint:check
$ oxlint --deny-warnings .
(node:…) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/oxlint.config.ts?cache=… is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:…) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/tooling/oxlint/anti-slop/effect/index.ts?cache=… is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/tooling/oxlint/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
```

(no lint finding, exit 0; the two `MODULE_TYPELESS_PACKAGE_JSON` warnings are
the pre-existing environment noise C001–C005 recorded)

```text
$ bun run --cwd packages/references format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 188ms on 50 files using 16 threads.
```

```text
$ bun run --cwd packages/references cli --help
$ bun run src/apps/cli/main.ts --help
DESCRIPTION
  Register, materialize, and verify third-party reference clones stored in .agents/@montflow/references.

USAGE
  mf-references <subcommand> [flags]

GLOBAL FLAGS
  --help, -h                                                          Show help information
  --version, -v                                                       Show version information
  --wizard                                                            Start wizard mode for a command
  --completions <bash|zsh|fish|sh>                                    Print shell completion script (choices: bash, zsh, fish, sh)
  --log-level <all|trace|debug|info|warn|warning|error|fatal|none>    Sets the minimum log level (choices: all, trace, debug, info, warn, warning, error, fatal, none)

SUBCOMMANDS
  doctor    Verify the workspace scaffolding, registry, and packaged skills; repair what it can.
  list      List every reference with its clone presence and purpose.
  show      Print one entry’s REFERENCE.md bytes.
  verify    Verify committed store bytes, optionally with local clone state. Non-zero on any issue.
  add       Register and clone one https URL. A registered URL routes to update.
  update    Refresh one entry, or --all, by name or URL.
  sync      Materialize missing clones or repair local checkouts. Never writes the store.
  status    Report local clone state for one entry or every entry. Reports never gate.
  remove    Unregister one entry and, unless --keep-clone, its clean clone.
```

### 4. Skill-standard verifier, exactly what ran

Two checks, both recorded:

1. In-package test `montflow-add-reference: passes the full montflow standard
   verifier` and `montflow-find-reference: passes the full montflow standard
   verifier` call
   `Skill.verifyStandardSkillFile(name, SKILL.md)` from
   `packages/skills/src/modules/skill/skill.module.ts`; both assert
   `{ valid: true, issues: [] }`.
2. The sibling CLI against a throwaway workspace populated with both packaged
   skill directories:

```text
$ rm -rf /tmp/opencode/c006-skills && mkdir -p /tmp/opencode/c006-skills/.agents/skills && cp -r packages/references/skills/montflow-add-reference packages/references/skills/montflow-find-reference /tmp/opencode/c006-skills/.agents/skills/ && bun run --cwd packages/skills cli verify --dir /tmp/opencode/c006-skills
$ bun run src/apps/cli/main.ts verify --dir "/tmp/opencode/c006-skills"
2 skills · 0 issues
```

The sibling command was used deliberately: `mf-skills verify` reads only
`.agents/skills/`, so it was pointed at a copy rather than claiming it verifies
`packages/references/skills/` in place.

### 5. Doctor command evidence

`--check` on a fresh workspace (report-only, exit 1):

```text
$ bun run --cwd packages/references cli doctor --check --dir /tmp/opencode/c006-doctor
$ bun run src/apps/cli/main.ts doctor --check --dir "/tmp/opencode/c006-doctor"
failed store-root: missing .agents/@montflow/references
failed registry: store-root missing; nothing to verify
failed clone-root: missing .agents/references
failed gitkeep: missing .agents/references/.gitkeep
failed gitignore: missing .agents/references
failed skills-installed: missing montflow-add-reference, montflow-find-reference
failed skills-current: missing montflow-add-reference; missing montflow-find-reference
summary checks=8 failed=7 repaired=0
error: script "cli" exited with code 1
EXIT=1
```

Repair mode (no clone exists, exit 0), then an idempotent `--check`:

```text
$ bun run --cwd packages/references cli doctor --dir /tmp/opencode/c006-doctor
$ bun run src/apps/cli/main.ts doctor --dir "/tmp/opencode/c006-doctor"
repaired store-root: created .agents/@montflow/references
repaired clone-root: created .agents/references
repaired gitkeep: created .agents/references/.gitkeep (not a git work tree)
repaired gitignore: appended .agents/references
repaired skills-installed: installed montflow-add-reference, montflow-find-reference origin=package
summary checks=8 failed=0 repaired=5
EXIT=0

$ bun run --cwd packages/references cli doctor --check --dir /tmp/opencode/c006-doctor
$ bun run src/apps/cli/main.ts doctor --check --dir "/tmp/opencode/c006-doctor"
summary checks=8 failed=0 repaired=0
EXIT=0
```

### 6. `GATES.md` checkbox → named passing test / command

| Stage | Checkbox | Evidence |
|---|---|---|
| 0 | both packaged `SKILL.md` files pass the full montflow standard verifier | `embedded-payload.test.ts > embedded reference skill payload > montflow-*: passes the full montflow standard verifier`; sibling CLI `2 skills · 0 issues` |
| 0 | each skill's frontmatter version equals its newest changelog entry | `… > montflow-*: frontmatter version is the newest changelog entry` |
| 0 | neither skill carries a registry table | `packaged skill contract > montflow-*: carries no registry table` |
| 0 | both skills call `mf-references` / `/mf-references` | `packaged skill contract > montflow-*: calls the CLI on both surfaces` |
| 0 | the add skill documents that a registered reference routes to `update` | `packaged skill contract > the add skill documents that a registered reference routes to update` |
| 1 | missing skills are installed; stale skills are repaired; mismatched file sets are reported | `Doctor.runDoctor skills > installs every shipped skill into a bare repo`; `… > repairs a stale skill copy`; `… > check mode reports a mismatched file set; repair restores it` |
| 1 | a missing `.gitignore` entry and a missing `.gitkeep` are repaired | `Doctor.runDoctor workspace > a missing ignore rule is repaired without touching other lines`; `… > a missing .gitkeep is recreated and staged in a git work tree` |
| 1 | an invalid registry entry is reported with its entry and field | `Doctor.runDoctor workspace > reports an invalid registry entry with its entry and field` (asserts entry path and `[url]`) |
| 1 | `--check` writes nothing and exits 1 when unhealthy | `… > check mode writes nothing and exits unhealthy`; `… > check mode reports a stale copy as drift and writes nothing`; `slash run > runs doctor --check as a report that fails on drift and writes nothing`; `binary > wires doctor --check to the one exit helper on drift`; manual `EXIT=1` above |
| 1 | the embedded payload matches `skills/` | `embedded reference skill payload > montflow-*: the embed matches skills/ byte for byte` |
| 1 | `doctor` does not fail when no clone exists | `Doctor.runDoctor workspace > mirrors the checkout when no clone exists`; manual repair `EXIT=0` above with no `.agents/references/<slug>` created |

## Open Questions

1. **Retired-warning rendering.** B003 §3's doctor grammar lists only
   `failed`/`repaired` lines plus `ok` under `--verbose`; a warning has no token.
   I print `warn retired-skills: …` in agent mode (and `⚠` in the human table)
   so the advisory is visible without failing the run. A reviewer may prefer it
   behind `--verbose` or folded into the summary; one renderer change.
2. **Git-work-tree predicate.** To honour "doctor invokes git for exactly one
   thing", the staging path checks `<root>/.git` exists (directory or file)
   instead of calling `GitPort.isRepo` (`rev-parse --is-inside-work-tree`). A
   broken `.git` without git installed therefore reports `gitkeep` drift after
   creating the file. If the reviewer prefers the port query, it is one call and
   a second documented git invocation.
3. **Duplicate `--check` reports for a missing skill.** `skills-installed`
   reports `missing <name>` and `skills-current` repeats it as `missing <name>`
   rather than silently skipping. The failures share one cause but each check
   answers its own question; a reviewer may want current to defer to installed.
4. **Registry warnings are folded into the registry detail.** Warnings never
   affect health, but they print inside the same line as errors when both exist.
   No separate doctor warning line was added for entry warnings.
5. **Engine signature.** `Engines.doctor` takes a root string per B003 §5
   (`doctor(cwd, …)`), unlike every other engine's `StoreScope`. Binary/slash
   compute `rootOf(scope)`; a future scope-taking engine would be a small
   wrapper, not a behaviour change.
6. **No spawned-binary test.** `--check` exit 1 is proven by the slash failure,
   the binary source assertion, and the manual command, not by running
   `main.ts` in a subprocess. The compiled-binary embedded fallback is proven at
   the `readPayload` level, not by compiling.

## Handoff

- **C007 (gate/migration):** the gate line is
  `verify --all --dir $PWD && doctor --check --dir $PWD`. `doctor --check`
  exits 1 on missing scaffolding, invalid entries, missing/stale/mismatched
  skills, and prints a `warn` line for the retired generic pair; it never
  deletes them. Delete `.agents/skills/{adding-references,finding-references}`
  in C007 as planned.
- **D001 (skills alignment):** both skills use B003 §11's pipelines with the
  scoped `--dir "$PWD"` form; D001 owns retiring links to the old names and the
  taxonomy examples.
- **D002/E003 (docs):** document the ninth verb (`doctor [--check]`) in the
  README/CONTEXT/surface tables, and keep the `--status installed|missing`
  divergence remedy B003 §14 assigned to them.
- **No new tools.** The server still exposes exactly `reference_add` and
  `reference_find`; doctor is CLI/slash only.
- **Regeneration:** after editing either skill, run
  `bun run --cwd packages/references generate:payload`; the payload-drift test
  fails otherwise. `build:cli` now does this automatically.

## Deviations

- **`warn` line for retired skills** (Open Question 1): an additive agent token
  not in B003 §3's doctor grammar, chosen so a warning is visible in the default
  mode and still never fails the run.
- **`build:cli` now runs the generator first.** The task asked for the generator
  and payload; making `build:cli` regenerate mirrors `packages/reviews` and
  prevents a compiled binary from carrying a stale embed. No other script
  changed.
- **`.git` existence as the work-tree predicate** rather than `GitPort.isRepo`,
  to keep doctor's only git invocation the documented `add -f` staging call.
- **`skills-current` reports extra files without rewriting them**, per B003 §7's
  "extras are reported and keep the check healthy"; the reviews doctor treats
  extras as `mismatched`/unhealthy, and this package deliberately does not.
- **`sameFiles` helper omitted** from the copied reviews module; the check needs
  the actual extra/absent lists for its detail, so set equality alone was dead
  code.
- **Only `packages/references/` and this `MEMORY.md` were written.** The
  `.agents/skills/adding-references` and `finding-references` directories were
  not touched (C007/D001 own retirement), and `doctor` was never run against the
  repo root, so no skill was installed outside `packages/references/`. `bun.lock`
  was already modified before this task (C001/C004 recorded it) and was not
  touched.
