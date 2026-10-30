# Memory

## Context

- Task: **C007 — migrate-registry-and-wire-gate** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin` (HEAD `a94972e`, branch
  `feat/reference-plugin`).
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md` (1–53).
  Task read: `.../C007-migrate-registry-and-wire-gate/TASK.md` (1–38) and
  `GATES.md` (1–17).
- Contract sources: B001 `MEMORY.md` §8 (the 14-row table, `purpose` proposals,
  blame `added` dates, `opencode` pin) and §9 (valid-entry example), §2/§3/§4
  (frontmatter, `ref`, body); A003 `MEMORY.md` §1d (inbound links), §2 (pin),
  §4 (delete/create/keep list), §5 (CI-safe boundary); SPEC:51–73;
  C006 `MEMORY.md` (shipped skills + the exact gate line).
- Implementation read before touching anything: `packages/references/package.json`,
  CLI `binary.apps.module.ts` + `Engines.verify`, `modules/reference`,
  `modules/verifier`, `apps/doctor/doctor.apps.module.ts`, `git/lifecycle.sync`,
  root `package.json`, `.github/workflows/verify.yml`, `.gitignore:254–257`,
  `.changeset/config.json`, `packages/references/README.md`, the two retired
  skills before deletion, `authoring-skills/SKILL.md`,
  `bookkeeper/PROFILE.md`.
- Pre-state: `.agents/@montflow/references/` did **not** exist (no C001 store
  scaffold landed in this worktree), `.agents/references/` held only `.gitkeep`
  (tracked), the two generic skills were still installed, and the two
  `montflow-*` skills were **not** installed into `.agents/skills/`.
- Scope executed: `packages/references/` (README only), the new store, the two
  deleted skill directories, the two installed `montflow-*` skill mirrors,
  `authoring-skills/SKILL.md` + its `CHANGELOG.md`,
  `bookkeeper/PROFILE.md`, root `package.json`,
  `.github/workflows/verify.yml`, `.changeset/references-plugin.md`, and this
  `MEMORY.md`. No product code, no `SPEC.md`/`TASK.md`/`GATES.md`/status/lock,
  no `.gitignore`, no `.agents/references/.gitkeep`, no `bun.lock` (already
  modified before this task; untouched).

## Progress

Done, in order:

1. Created all 14 `.agents/@montflow/references/<slug>/REFERENCE.md` entries
   from B001 §8, byte-for-byte `url`, authored `purpose`, blame `added`, and a
   `ref` on `opencode` only.
2. Proved URL preservation mechanically: extracted the old table rows from
   `git show HEAD:.agents/skills/finding-references/SKILL.md` (lines 58–71) and
   diffed name+URL against the new entries → identical, 14/14.
3. Ran the CI-safe verifier per entry and for the whole store: 14 ×
   `summary entries=1 issues=0 warnings=0`, and
   `summary entries=14 issues=0 warnings=0`.
4. Deleted `.agents/skills/adding-references/` and
   `.agents/skills/finding-references/` wholesale (`SKILL.md`, `CHANGELOG.md`,
   and `finding-references/GATES.md`); re-ran `mf:check:skills`.
5. Repointed every live inbound link: `authoring-skills/SKILL.md:200,206,207`
   groups table and `bookkeeper/PROFILE.md:20–21,46`. Bumped `authoring-skills`
   to `1.6.1` with a changelog entry (repo skill convention); fixed the
   bookkeeper "five extension families" → "six".
6. Installed the two packaged skills into `.agents/skills/` with
   `mf-references doctor` (required by `doctor --check`; see Findings §4).
7. Wired the gate: root `mf:check:references`, composition into `mf:check`, CI
   matrix cell `references`.
8. Added `.changeset/references-plugin.md`, verified `changeset status`, and
   updated the package README migration + status sections.
9. Ran every proof listed in TASK, including a clone-present fixture built from
   the sibling worktree's `opencode` clone for `status` / `sync` / `verify
   --clones`.

## Findings

### 1. The 14 entries — written, and URL-identical to the retired table

Every entry is `.agents/@montflow/references/<slug>/REFERENCE.md` with
frontmatter `name`, `url`, `purpose`, `added` (+ `ref` on `opencode`) and a
`# Notes` body. Slugs, URLs, purposes, and dates are B001 §8 verbatim.

Byte-identity proof (old table recovered from the deleted file via `git show`):

```text
$ git show HEAD:.agents/skills/finding-references/SKILL.md | sed -n '58,71p' \
    | awk -F'|' '{gsub(/^ +| +$/,"",$2); gsub(/^ +| +$/,"",$4); print $2"|"$4}' \
    > /tmp/opencode/old-registry.txt
$ for d in $(cut -d'|' -f1 /tmp/opencode/old-registry.txt); do \
    u=$(sed -n 's/^url: //p' ".agents/@montflow/references/$d/REFERENCE.md"); \
    printf '%s|%s\n' "$d" "$u"; done > /tmp/opencode/new-registry.txt
$ diff /tmp/opencode/old-registry.txt /tmp/opencode/new-registry.txt
URLs byte-identical (all 14)
14 /tmp/opencode/old-registry.txt
```

The two slug≠repo cases are preserved (`effect` → `effect-smol`,
`sveltekit` → `kit`), the 7/7 `.git` split is preserved, and `SigNoz` casing is
preserved — i.e. no row was normalized at migration.

### 2. `opencode` pin and the clone lifecycle

`opencode/REFERENCE.md` carries
`ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862`; the body notes record that this
commit is tag `v2.0.18` and that the ten
`.agents/@montflow/specs/montflow-opencode-migration` files quote the tag. The
other 13 entries omit `ref` (default branch). `anti-slop/REFERENCE.md` body
records the vendored copy (`tooling/oxlint/anti-slop/`, MIT, Dillon Mulroy) and
a refresh rule; every other body is an empty `# Notes` section.

Clone-present proof, using a throwaway fixture at `/tmp/opencode/c007-fixture`
(store copied, `opencode` clone copied from the sibling worktree
`/home/daniel/dev/montflow/main`, which sits on `dev` at `23e3493ab2`):

```text
$ bun run --cwd packages/references cli status opencode --dir /tmp/opencode/c007-fixture
ref-mismatch opencode head=23e3493ab2 expected=cd9a14a
summary total=1 missing=0 present=0 dirty=0 ref-mismatch=1 foreign=0
EXIT=0

$ bun run --cwd packages/references cli sync opencode --dir /tmp/opencode/c007-fixture
updated opencode @ cd9a14a6b688d4021bee381dfd39d2cef9c0f862
summary total=1 created=0 updated=1 ok=0 skipped=0 failed=0
EXIT=0

$ bun run --cwd packages/references cli status opencode --dir /tmp/opencode/c007-fixture
present opencode
summary total=1 missing=0 present=1 dirty=0 ref-mismatch=0 foreign=0
EXIT=0

$ bun run --cwd packages/references cli sync opencode --dir /tmp/opencode/c007-fixture
ok opencode
summary total=1 created=0 updated=0 ok=1 skipped=0 failed=0
EXIT=0

$ git -C /tmp/opencode/c007-fixture/.agents/references/opencode rev-parse HEAD
cd9a14a6b688d4021bee381dfd39d2cef9c0f862
$ git -C … describe --tags --exact-match
v2.0.18
```

So: the recorded commit resolves; `status` reports `ref-mismatch` for the
pre-existing local clone (A003's expected state) and `present` once at the pin;
the first `sync` is a repair (`updated … @ <ref>`), and on an already-correct
clone `sync` is a true no-op (`ok opencode`). `verify --clones` in that fixture
reported exactly 13 `clone-missing` issues — the present `opencode` clone
produced none, i.e. the pin head compares clean.

Clone-less behaviour in this worktree (recorded because the fixture only covers
the pinned row):

```text
$ bun run --cwd packages/references cli status opencode --dir $PWD
missing opencode
summary total=1 missing=1 present=0 dirty=0 ref-mismatch=0 foreign=0
EXIT=0
```

`sync opencode` here would clone over the network; it was **not** run in this
worktree (that would materialize a 600 MB clone in a worktree whose clone root
must stay at `.gitkeep` for the CI-shape proof).

### 3. Retirement and inbound links

Deleted wholesale (5 files):

- `.agents/skills/adding-references/{SKILL.md,CHANGELOG.md}`
- `.agents/skills/finding-references/{SKILL.md,CHANGELOG.md,GATES.md}`

Repointed (every live inbound link A003 §1d named, plus nothing else):

| File:line | Before | After |
|---|---|---|
| `.agents/skills/authoring-skills/SKILL.md:200` | `workflow` example `adding-references` | `montflow-find-reference` |
| `…:206` | `git` example `adding-references` | `montflow-add-reference` |
| `…:207` | `references`: `finding-references, adding-references` | `montflow-find-reference, montflow-add-reference` |
| `.agents/@montflow/profiles/bookkeeper/PROFILE.md:20–21` | `adding-references`, `finding-references` in `skills:` | `montflow-add-reference`, `montflow-find-reference` |
| `…:46` | row `References \| .agents/references/<name>/ \| … \| manual structure check \| old pair` | row keyed on `.agents/@montflow/references/<slug>/REFERENCE.md`, verifier `bun run mf:check:references`, repair skills the new pair |
| `…:51` | "all five extension families" | "all six extension families" |

`authoring-skills` was version-bumped `1.6.0 → 1.6.1` with a dated changelog
entry (repo convention from `modifying-skills`: patch + dated entry); its
historical rename note (`CHANGELOG.md:61`, `adding-vendor` → `adding-references`)
is left as written.

`mf:check:skills` after deletion:

```text
$ bun run mf:check:skills
46 skills · 0 issues
✓ skills are installed and up to date.
✓ montflow-create-pi-skills: up to date → …/.agents/skills/montflow-create-pi-skills
✓ montflow-modify-pi-skills: up to date → …/.agents/skills/montflow-modify-pi-skills
EXIT=0
```

Repo-wide name sweep (`grep -rn "adding-references\|finding-references"`, minus
`node_modules`/`dist`) leaves only:

- migration notes — `packages/references/README.md:103–106`, both packaged-skill
  `CHANGELOG.md:12`, their installed mirrors, and
  `.changeset/references-plugin.md:5`;
- the doctor's intentional retired-name list
  (`src/apps/doctor/doctor.apps.module.ts:41`) and its tests
  (`run-doctor.test.ts:165–166`);
- history — `authoring-skills/CHANGELOG.md:61`.

No live link points at a deleted path.

### 4. The packaged skills had to be installed for the gate to pass

`doctor --check` includes `skills-installed` and `skills-current`
(SPEC:59, B003 §7), so `mf:check:references` cannot pass until
`montflow-add-reference` and `montflow-find-reference` exist under
`.agents/skills/`. Neither was installed in this worktree (C006 never ran
doctor against the repo root). Installed the sanctioned way:

```text
$ bun run --cwd packages/references cli doctor --dir $PWD
repaired skills-installed: installed montflow-add-reference, montflow-find-reference origin=package
summary checks=8 failed=0 repaired=1
EXIT=0
```

The installed trees are byte-identical to the package (`diff -r` on both →
no output), and `skills-current` now keeps them so in the gate. This is a
consequence of retirement, not a phase-D doc change; see Open Question 1 about
the literal "no `montflow-*` skill outside the package" wording.

### 5. Gate wiring

Root `package.json:35–36`:

```json
"mf:check:references": "bun run --cwd packages/references cli verify --dir $PWD && bun run --cwd packages/references cli doctor --check --dir $PWD",
"mf:check": "bun run mf:check:skills && … && bun run mf:check:reviews && bun run mf:check:references",
```

CI matrix, `.github/workflows/verify.yml:161–162` (after `reviews`, same shape
as the neighbouring cells):

```yaml
          - target: references
            script: mf:check:references
```

`mf:check` is the cross-scope gate for this task (root script + skills +
profiles + references), so it was run whole:

```text
$ bun run mf:check
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues
11 profiles · 0 issues · 0 warnings
13 files · 0 issues
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0
```

### 6. Changelogs and the changeset convention

Repo convention checks before writing (as the task asked):

- No `.changeset/*.md` has ever been committed in this repo (`git log
  --diff-filter=A -- '.changeset/*.md'` → empty); `.changeset/config.json` sets
  `privatePackages.version: false` and lists 15 private packages under `ignore`.
  `INSTALL.md:69–70` states the boundary: "`.changeset/config.json` ignores
  every private package".
- `montflow-ci-verification/C007` (MEMORY:33–36, 57–58) ruled that a changeset
  for a private package is a no-op and recorded it rather than fabricating one.
- Skill changelogs are per-skill `CHANGELOG.md` (Keep a Changelog + SemVer);
  packages have **no** `CHANGELOG.md` in this repo (`git ls-files
  'packages/*/CHANGELOG.md'` → empty).

What C007 did:

- Added `.changeset/references-plugin.md` (`"@montflow/references": minor`) with
  the package + surface + migration summary. `bun run changeset status` accepts
  it and reports `NO packages to be bumped at patch/minor/major` (expected: the
  package is private and `privatePackages.version` is false), so no version or
  lockfile side effect.
- The two packaged skills' `CHANGELOG.md` migration notes already existed
  (C006 wrote them, each `1.0.0` with a "Changed (breaking)" migration block);
  C007 verified them rather than duplicating, since C007 changed neither
  skill's content.
- `packages/references/README.md` gained a `## Migrating from the workspace
  skills` section (retired→replacement table, 14 rows → store entries, pin
  unchanged, gate replaces the manual table check) and its stale `## Status`
  paragraph ("scaffolded, not implemented") was corrected to the shipped state.
- `authoring-skills` got the version bump + dated entry described in Findings
  §3.

### 7. `--cwd` changes the working directory (task-command caveat)

The task's proof list says `bun run --cwd packages/references cli verify` and
`status opencode` without `--dir`. Both resolve the store relative to
`process.cwd()`, and `bun run --cwd <pkg>` **chdirs into the package**, so from
the repo root they fail:

```text
$ bun run --cwd packages/references cli verify
error .agents/@montflow/references has 1 issue. Fix each one and run verify again.

1. [store] Store root .agents/@montflow/references/ is missing; run 'mf-references doctor'.

summary entries=1 issues=1 warnings=0
EXIT=1

$ bun run --cwd packages/references cli status opencode
refused: unknown reference 'opencode'; run 'mf-references list'
EXIT=1
```

The working forms are the ones `mf:check:references` uses (shell expands `$PWD`
before bun chdirs): `… cli verify --dir $PWD` and
`… cli status opencode --dir $PWD`. Recorded so the next reader does not file
this as a regression: it is the documented `--dir` = workspace-root contract,
not a package bug.

### 8. Clone-less CI safety

This worktree **is** the CI shape: `.agents/references/` contains only
`.gitkeep` (0 bytes, tracked), and the store is committed, not ignored
(`git check-ignore -v --no-index .agents/@montflow/references/effect/REFERENCE.md`
→ no output, exit 1). With that state:

```text
$ find .agents/references -maxdepth 1
.agents/references
.agents/references/.gitkeep

$ bun run mf:check:references
$ bun run --cwd packages/references cli verify --dir $PWD
summary entries=14 issues=0 warnings=0
$ bun run --cwd packages/references cli doctor --check --dir $PWD
summary checks=8 failed=0 repaired=0
EXIT=0
```

Nothing in the gate touches a clone, git, the network, or the clock.

### 9. `pack:plugins`

```text
$ bun run pack:plugins
@montflow/references
  local: /home/daniel/dev/montflow/reference-plugin/packages/references
  artifact: /home/daniel/dev/montflow/reference-plugin/dist/pack/@montflow__references
…
EXIT=0
```

Artifact exists: `dist/pack/@montflow__references/{index.js,server.js,tui.js,package.json}`
(`ls -la` → 267805 / 272396 / 272361 / 441 bytes). `dist/pack/**` is gitignored,
so nothing was added to the tree.

### 10. `GATES.md` checkbox → evidence

| Stage | Checkbox | Evidence |
|---|---|---|
| 0 | all 14 `REFERENCE.md` entries verify | 14 × `cli verify <slug> --dir $PWD` → `summary entries=1 issues=0 warnings=0`, exit 0; whole store → `entries=14 issues=0 warnings=0` |
| 0 | retired skill directories gone and no inbound link uses the old names | `ls .agents/skills` → no `*reference*` directory; `grep -rn` sweep leaves only migration notes, the doctor's retired-name constant/test, and history (Findings §3) |
| 0 | `mf:check:skills` passes after the deletion | `46 skills · 0 issues`, exit 0 (Findings §3) |
| 0 | no `montflow-*` reference skill exists outside the package | `grep -rln -- "montflow-[a-z-]*reference" packages/*/skills` → only `packages/references/skills/{montflow-add-reference,montflow-find-reference}/SKILL.md`; the only copies elsewhere are the two `doctor`-installed mirrors, `diff -r`-identical to the package (Open Question 1) |
| 0 | `status` reports the expected `opencode` state and `sync opencode` is a no-op | fixture: `ref-mismatch … expected=cd9a14a`, then `updated … @ cd9a14a…`, then `present`, then `ok opencode` (Findings §2); clone-less: `missing opencode`, exit 0 |
| 1 | `mf:check:references` passes in a clone-less checkout | Findings §8: exit 0 with only `.gitkeep` |
| 1 | `mf:check` composes the new scope and the CI matrix has the cell | Findings §5: `bun run mf:check` exit 0 with `mf:check:references` last; `verify.yml:161–162` |
| 1 | `bun run pack:plugins` emits the package artifact | Findings §9: artifact listed and present |
| 1 | changelog entries exist for the new package and skills | Findings §6: `.changeset/references-plugin.md`, both skill `CHANGELOG.md` migration blocks (C006), authoring-skills `1.6.1` |
| 1 | `mf-specs check --name montflow-references-plugin` reports zero issues | `bun run --cwd packages/specs cli check --dir $PWD --name montflow-references-plugin` → `1 spec · 0 failed · 0 issues`, exit 0 |

### 11. Package suite (unchanged code, re-run)

```text
$ bun run --cwd packages/references test
Test Files  28 passed (28)
     Tests  276 passed (276)
Type Errors  no errors
EXIT=0

$ bun run --cwd packages/references ts:check
$ tsc --noEmit
EXIT=0

$ bun run --cwd packages/references format:check
All matched files use the correct format.
EXIT=0

$ bun run --cwd packages/references lint:check
(no lint finding; only the two pre-existing MODULE_TYPELESS_PACKAGE_JSON warnings)
EXIT=0
```

`format:check` initially failed on `README.md` (the new table); `format:fix`
(within package scope) realigned it and the re-run is clean.

## Open Questions

1. **"No `montflow-*` reference skill exists outside the package" vs the
   doctor-installed mirrors.** Taken literally the checkbox cannot hold while
   `mf:check:references` passes: `doctor --check` requires
   `.agents/skills/montflow-add-reference` and
   `.agents/skills/montflow-find-reference` (SPEC:59, B003 §7). Read as
   intended: no unmanaged skill *source* outside the package — the only
   copies are the doctor-installed, `diff -r`-identical payload. A reviewer who
   wants the literal reading must change doctor's `skills-installed` contract
   or the gate definition, not this migration.
2. **The changeset is a documented no-op.** `@montflow/references` is private
   and `privatePackages.version` is false, so `changeset status` reports no
   bump. I did **not** add the package to `.changeset/config.json`'s `ignore`
   list (which is how the other 15 private packages are treated, and what
   `INSTALL.md:69–70` asserts) because the task explicitly asks for a changeset
   entry and a changeset referencing an `ignore`d package is the broken
   combination, not the working one. Reviewer options: (a) keep the entry as
   the package's changelog-of-record and relax the INSTALL wording in D002;
   (b) drop the entry and add the package to `ignore`, recording the migration
   only in the README + skill changelogs (the `montflow-ci-verification`
   precedent). Everything else passes either way; `changeset status` was run
   against both configurations and both report no bump.
3. **Skill mirror freshness is now load-bearing.** Editing either packaged
   `SKILL.md` without re-running `bun run --cwd packages/references
   generate:payload` (or `doctor`) makes `skills-current` fail. D001 will edit
   both skills; it must regenerate the payload and re-install (or run doctor)
   in the same change.
4. **`authoring-skills` groups-table edit is duplicated with D001.** D001's
   TASK:29 also owns that table. C007 did it now because deleting the skills
   would otherwise leave dead names; D001 should treat it as already done and
   only add anything new.

## Handoff

- **D002 (docs, explicitly *not* done here):** root `README.md` package list
  (`:6–14`) and skill-sync matrix (`:41–45`) and the two `for p in …` loops
  (`:62`, `:70–76`); `INSTALL.md:45–49` plugin list (+ the `:69–70` "ignores
  every private package" wording if Open Question 2 resolves to option (a));
  `AGENTS.md:66–70` verification scopes (five → six) and `:27,33–34`
  scope-naming contract; `.agents/documentation/author-mf-utility-cli.md:15–21`
  surface table (+ the ninth verb `doctor`); `lefthook.yml` comment if it
  enumerates scopes. Drive-by candidates A003 recorded and C007 did not touch:
  `packages/linting/README.md:61–62` (nonexistent `anti-slop` clone claim) and
  `oxlint.config.ts:35` (nonexistent `install-anti-slop` skill).
- **D001 (skills):** the packaged skills' pipelines vs the shipped CLI; do not
  re-do the groups table (done). After editing, regenerate
  `embedded-payload.generated.ts` and re-run `doctor`/`mf:check:references`
  (Open Question 3).
- **Reviewer:** the 14 `purpose` strings are B001 §8's authored proposals,
  written verbatim — not migrated text. The migration's data claims are: slug
  set, URL bytes, `added` dates, and the `opencode` commit pin.
- **Orchestrator:** no `BOARD.md` or `MAILBOX.md` exists in this spec, so the
  PROFILE's step-5 broadcast had no target; this file is the handoff.

## Deviations

- **Installed the two packaged skills into `.agents/skills/`** (via
  `mf-references doctor`, not hand-copied). Outside the literal scope list, but
  mandatory for `mf:check:references` to pass and for retirement to leave a
  working skill surface (Findings §4).
- **Edited `packages/references/README.md`'s `## Status` paragraph** as well as
  adding the migration section: it claimed the surface was "scaffolded, not
  implemented", which is false since C002–C006. Flagged rather than silently
  left.
- **Bumped `authoring-skills` `1.6.0 → 1.6.1`** with a dated changelog entry —
  repo skill convention for a touched skill; the task did not name this file's
  changelog but did name the file.
- **bookkeeper "five" → "six" extension families** in the same file as the
  required inbound-link edit; leaving it would have made the sentence false.
- **Did not run `sync opencode` in the repo worktree** (it would clone 600 MB
  and destroy the clone-less proof); used a `/tmp` fixture copied from the
  sibling worktree instead, and recorded the clone-less `status` output
  verbatim.
- **Did not touch**: `SPEC.md`, `TASK.md`, `GATES.md`, any status/lock/ledger,
  `.gitignore`, `.agents/references/.gitkeep`, `bun.lock` (pre-existing
  modification), the phase-D doc list, or any product code outside
  `packages/references/README.md`.
- **Date used** in the authoring-skills changelog is the environment date
  (2026-10-26); no other timestamp, id, or status was invented.
