# Memory

## Context

- Task: **A001 — map-reference-surface** (exploratory), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Spec read: `.agents/@montflow/specs/montflow-references-plugin/SPEC.md`
  (1–101). Task read: `.../A001-map-reference-surface/TASK.md` (1–36).
  SPEC citations were re-anchored to the current file after phase E added
  three description lines and three requirements; requirement text remains
  authoritative over any line number.
- Work-order sources that **do not exist**: the spec directory holds only
  `SPEC.md` plus the 23 task directories — no `PHASE.md`, no `BOARD.md`, no
  per-task `MAILBOX.md` (`find … -maxdepth 2 -name BOARD.md -o -name MAILBOX.md
  -o -name PHASE.md` → no output). Nothing was broadcast; see Deviations.
- Scope discipline: read-only exploration. The only file written is this
  `MEMORY.md`. No product, skill, doc, spec, gate, or other task file touched.
- Goal: ground the package requirements in what exists. Everything below is
  evidence with exact path + line numbers, not a plan.

## Progress

Done, in order:

1. Read `PROFILE.md`, `SPEC.md`, `TASK.md`, placeholder `MEMORY.md`.
2. Inventoried both skills: `SKILL.md` + `CHANGELOG.md` (+ `GATES.md` for one),
   frontmatter, groups, pipeline headings, every fenced command.
3. Read the registry table in `finding-references/SKILL.md` (14 rows).
4. Inspected the clone root and the ignore rule:
   - `ls -la .agents/references/` → only `.gitkeep` (0 bytes).
   - `find .agents/references -maxdepth 2` → `.agents/references` and
     `.agents/references/.gitkeep` only.
   - `find .agents -maxdepth 3 -name .git -type d` → none (no nested clones).
   - `for n in <14 slugs>; do [ -d .agents/references/$n ] …` → **all 14 ABSENT**.
   - `git ls-files .agents/references` → `.agents/references/.gitkeep` (tracked).
   - `git log -1 --format='%h …' -- .agents/references/.gitkeep` →
     `5f10e35 2026-07-24 feat(skills): add auto-clone and .gitkeep to reference skills`.
   - `grep -n references .gitignore` → single hit `257:.agents/references`.
   - `git check-ignore -v --no-index .agents/references/{.gitkeep,opencode}` →
     both `.gitignore:257:.agents/references`.
   - `ls -d references vendor` → both absent (legacy paths gone).
5. Repo-wide evidence sweep for `\.agents/references`,
   `adding-references|finding-references`, `mf-references`,
   `reference_add|reference_find`, `montflow-add-reference|montflow-find-reference`
   (excluding `node_modules`, `.git`, `dist`, and this spec's own dir).
6. Read the naming/verification artifacts: `authoring-skills/SKILL.md`,
   `bookkeeper/PROFILE.md`, `packages/linting/README.md`,
   `.agents/documentation/*.md`, root `README.md` / `INSTALL.md` / `AGENTS.md`,
   `package.json`, `.github/workflows/{verify,release}.yml`, `lefthook.yml`.
7. Wrote this report. No mechanical gate exists for this task (`GATES.md`:
   none in the task dir; SPEC table line 79 `Gates: No`).

## Findings

### 1. Skill `adding-references`

- Path: `.agents/skills/adding-references/SKILL.md` (90 lines, 2702 bytes).
  Sibling: `CHANGELOG.md` (1735 bytes). **No `GATES.md`**, no `documentation/`,
  no `SCRIPTS/` — directory holds exactly the two files.
- Frontmatter (lines 1–13), key by key:

  | Key | Line | Value |
  |---|---|---|
  | `name` | 2 | `adding-references` |
  | `description` | 3 | "Adds and manages third-party reference source code as cloned git repositories. Use when the user wants to add reference source code for local reading or analysis." |
  | `id` | 4 | `e85e16a365fa6115` |
  | `author` | 5 | `Daniel Montilla` |
  | `version` | 6 | `2.2.0` |
  | `license` | 7 | `MIT` |
  | `dependencies` | 8–9 | `executing-skills` |
  | `groups` | 10–12 | `git`, `workflow` |

- Version history (`CHANGELOG.md`): `2.2.0` (3) added required `id`;
  `2.1.0` (9) added `.gitkeep` creation; `2.0.0` (21–30) replaced submodules with
  plain clones and moved `references/` → `.agents/references/`; `1.1.0` (32–39)
  renamed `adding-vendor` → `adding-references`, `vendor/` → `references/`.
- Migration note in body: line 19 (gitignored plain clones, formerly submodules).
  Prerequisite line 21 (load `executing-skills`).
- Pipeline headings + steps:

  | Step | Heading line | What it instructs |
  |---|---|---|
  | 1 | 25 `## 1. Pre-Execution Validation` | `git rev-parse --is-inside-work-tree` (27); be at repo root (28); create `.agents/references/` + `.gitkeep` (29–32); append `.agents/references` to `.gitignore` (33–36) |
  | 2 | 38 `## 2. Install Reference` | clone (40–44), verify with `ls -R` (46–50), **register by hand-editing the other skill** (52–58) |
  | 3 | 60 `## 3. Maintain Reference` | `cd … && git pull` (62–66) |
  | 4 | 68 `## 4. Read-Only Guardrails` | prose only: gitignore keeps clones out of commits (70–72) |
  | 5 | 74 `## 5. Recover from Modified Content` | `git reset --hard HEAD` (76–80) |

- Reference table (84–90) restates the same commands:

  | Action | Command | Line |
  |---|---|---|
  | Add reference | `git clone <url> .agents/references/<name>` | 86 |
  | Verify | `ls -R .agents/references/<name>` | 87 |
  | Register reference | Edit `.agents/skills/finding-references/SKILL.md` | 88 |
  | Update to latest | `cd .agents/references/<name> && git pull` | 89 |
  | Reset reference | `cd .agents/references/<name> && git reset --hard HEAD && cd -` | 90 |

- **Every command the skill tells an agent to run**, in execution order:
  1. `git rev-parse --is-inside-work-tree` (27)
  2. `mkdir -p .agents/references && touch .agents/references/.gitkeep` (31)
  3. `echo ".agents/references" >> .gitignore` (35)
  4. `git clone <repo-url> .agents/references/<reference-name>` (43, 86)
  5. `ls -R .agents/references/<reference-name>` (49, 87)
  6. `cd .agents/references/<reference-name> && git pull` (65, 89)
  7. `cd .agents/references/<reference-name> && git reset --hard HEAD && cd -` (79, 90)
  - Non-command action: edit the registry table in
    `.agents/skills/finding-references/SKILL.md` (54, 88).
- Gaps visible in the skill itself: registration is prose editing with no
  parse/validate step; "verify" is `ls -R` (presence, not git validity or
  cleanliness); no `ref`/branch/tag checkout; no rollback when clone fails; no
  URL validation; `git pull` is unconditional (no dirty check).

### 2. Skill `finding-references`

- Path: `.agents/skills/finding-references/SKILL.md` (73 lines, 3613 bytes).
  Siblings: `CHANGELOG.md` (1453 bytes), `GATES.md` (386 bytes, 11 lines).
  No `documentation/`, no `SCRIPTS/`.
- Frontmatter (lines 1–13):

  | Key | Line | Value |
  |---|---|---|
  | `name` | 2 | `finding-references` |
  | `description` | 3 | "Finds, explores, and reports on third-party reference source code cloned into the project. Use when the user wants to examine reference code, find a specific reference package, or understand available reference dependencies." |
  | `id` | 4 | `e0b85938c06a1fe9` |
  | `author` | 5 | `Daniel Montilla` |
  | `version` | 6 | `2.2.0` |
  | `license` | 7 | `MIT` |
  | `dependencies` | 8–9 | `executing-skills` |
  | `groups` | 10–12 | `references`, `workflow` |

- Version history (`CHANGELOG.md`): `2.2.0` (3) added `id`; `2.1.0` (9–18)
  added pipeline step 3 auto-clone from registry URLs + `.gitkeep`; `2.0.0`
  (20–26) plain clones, path move; `1.1.0` (28–36) rename from
  `finding-vendors`, group `vendors` → `references`.
- Pipeline headings + steps:

  | Step | Heading line | What it instructs |
  |---|---|---|
  | 1 | 25 `## 1. Identify Reference Request` | infer what the user needs (27) |
  | 2 | 29 `## 2. Locate Reference` | "using Glob" over `.agents/references/`, cross-reference the table (31) |
  | 3 | 33 `## 3. Clone Missing Reference (if needed)` | look URL up in the table (36), `mkdir`+`.gitkeep` (37), `git clone` (38), `ls -R` verify (39) |
  | 4 | 41 `## 4. Present Information` | report **Path**, **Purpose**, **URL** (43–46) — no ref/commit/pin |
  | 5 | 48 `## 5. Read Reference Code (if requested)` | read files in place (50) |

- **Every command it tells an agent to run**:
  1. `mkdir -p .agents/references && touch .agents/references/.gitkeep` (37)
  2. `git clone <url> .agents/references/<reference-name>` (38)
  3. `ls -R .agents/references/<reference-name>` (39)
  - Non-command actions: Glob search (31), read files (50), use
    `adding-references` to add a new one (73).
- Registry lives here: section `# Reference` starts at 52; READ ONLY warning 54;
  table 56–71; footer pointer 73.
- `GATES.md` (finding only) 1–11: Phase 1 Structure 1–5 (frontmatter fields,
  CHANGELOG SemVer+date, description third-person WHAT+WHEN); Phase 2 Content
  7–11 (pipeline clarity, "Reference registry table is accurate and up to date"
  line 10, READ ONLY warning line 11). All checkboxes — **no command, no
  verifier**; the registry-accuracy gate is unenforceable by machine today.

### 3. The registry as it exists today

- Sole registry: the markdown table in
  **`.agents/skills/finding-references/SKILL.md` lines 56–71** (header 56,
  separator 57, rows 58–71). Columns: `Reference | Path | URL`. A second,
  partial copy of the add command lives in `adding-references/SKILL.md:57`
  (template row), and `adding-references` registers by editing this table
  (54). No other machine-readable or frontmatter registry exists anywhere.
- All 14 rows, with local clone presence (`test -d .agents/references/<slug>`):

  | # | Name | URL (verbatim) | Path column | Line | Clone exists locally |
  |---|---|---|---|---|---|
  | 1 | alchemy-effect | `https://github.com/alchemy-run/alchemy-effect.git` | `.agents/references/alchemy-effect` | 58 | **ABSENT** |
  | 2 | drizzle-orm | `https://github.com/drizzle-team/drizzle-orm` | `.agents/references/drizzle-orm` | 59 | **ABSENT** |
  | 3 | effect | `https://github.com/Effect-TS/effect-smol` | `.agents/references/effect` | 60 | **ABSENT** |
  | 4 | orpc | `https://github.com/middleapi/orpc.git` | `.agents/references/orpc` | 61 | **ABSENT** |
  | 5 | shadcn-svelte | `https://github.com/huntabyte/shadcn-svelte` | `.agents/references/shadcn-svelte` | 62 | **ABSENT** |
  | 6 | sveltekit | `https://github.com/sveltejs/kit.git` | `.agents/references/sveltekit` | 63 | **ABSENT** |
  | 7 | signoz | `https://github.com/SigNoz/signoz` | `.agents/references/signoz` | 64 | **ABSENT** |
  | 8 | workers-oauth-provider | `https://github.com/cloudflare/workers-oauth-provider` | `.agents/references/workers-oauth-provider` | 65 | **ABSENT** |
  | 9 | effect-cf | `https://github.com/jbt95/effect-cf` | `.agents/references/effect-cf` | 66 | **ABSENT** |
  | 10 | vitest | `https://github.com/vitest-dev/vitest` | `.agents/references/vitest` | 67 | **ABSENT** |
  | 11 | anti-slop | `https://github.com/dmmulroy/anti-slop.git` | `.agents/references/anti-slop` | 68 | **ABSENT** |
  | 12 | opentui | `https://github.com/sst/opentui.git` | `.agents/references/opentui` | 69 | **ABSENT** |
  | 13 | opencode | `https://github.com/sst/opencode.git` | `.agents/references/opencode` | 70 | **ABSENT** (specs cite this pinned clone — see §5) |
  | 14 | pi-subagents | `https://github.com/nicobailon/pi-subagents.git` | `.agents/references/pi-subagents` | 71 | **ABSENT** |

  Evidence for the last column: `for n in alchemy-effect drizzle-orm effect orpc
  shadcn-svelte sveltekit signoz workers-oauth-provider effect-cf vitest
  anti-slop opentui opencode pi-subagents; do [ -d ".agents/references/$n" ] …`
  → 14× `ABSENT`. `find .agents/references -maxdepth 2` shows only `.gitkeep`.
- Data-shape observations that migration must preserve (SPEC.md:66,
  "migrated verbatim"):
  - 7 URLs end in `.git` (lines 58, 61, 63, 68, 69, 70, 71), 7 do not
    (59, 60, 62, 64, 65, 66, 67) — verbatim migration cannot normalize these
    without a decision.
  - Slug ≠ repo basename for 2 rows: `effect` → `effect-smol` (60), `sveltekit`
    → `kit` (63). `orpc` keeps its repo basename; only the owner casing differs
    (61). Naive "repo basename" slug derivation breaks the `effect`/`sveltekit`
    pins the repo already cites.
  - The table stores a `Path` column (`.agents/references/<slug>`), which SPEC.md:53
    forbids in the new store (path must be derived). Migration drops it.
  - No row records a branch/tag/commit (`ref`). Pins exist only in prose/specs.

### 4. Clone root, committed placeholder, ignore rule

- Clone root: `.agents/references/` — directory exists, contains **only**
  `.gitkeep` (0 bytes; `stat -c '%y'` → `2026-10-26 10:06:34`, the worktree
  checkout time). No nested `.git` directories
  anywhere under `.agents/` (`find` → none), so this worktree has zero
  references materialized right now.
- `.gitkeep` is **tracked**: `git ls-files .agents/references` →
  `.agents/references/.gitkeep`; added by commit
  `5f10e35 2026-07-24 feat(skills): add auto-clone and .gitkeep to reference skills`
  (matches `adding-references` 2.1.0 / `finding-references` 2.1.0 changelogs).
- Ignore rule: **`.gitignore:257` = `.agents/references`** (no trailing slash,
  no glob), inside the block `# --- montflow skills workspace ---` (254) whose
  prior entries are `.agents/@montflow/reviews` (255) and
  `.agents/@montflow/workspace.json` (256). It is the only occurrence
  (`grep -n references .gitignore` → one line).
- `git check-ignore -v --no-index .agents/references/opencode` →
  `.gitignore:257:.agents/references`; same for `.gitkeep`. Without
  `--no-index`, `.gitkeep` is reported as *not* ignored because git skips
  tracked paths — i.e. the directory rule covers the placeholder too, and
  `.gitkeep` survives only because it was committed once. Any future "write
  `.gitkeep`" flow needs `git add -f` or a `!.agents/references/.gitkeep`
  negation; no such negation exists today.
- Legacy locations are gone: `ls -d references vendor` → both "No such file or
  directory"; no `.gitmodules` match in the reference sweep.

### 5. Every other artifact that names the reference workflow

**Naming docs (the only live prose about references besides the two skills):**

| Artifact | Lines | Content | State |
|---|---|---|---|
| `.agents/skills/authoring-skills/SKILL.md` | 190 `## Groups`; table 194–207 | taxonomy rows: 200 `` `workflow` `` … `adding-references`; 206 `` `git` `` … `adding-references`; 207 `` `references` `` … `finding-references, adding-references` | names both old skills |
| same, body prose | 186–188 | "A skill that encodes a montflow **house rule** must be namespaced…" | the rule that forces `montflow-*` names |
| `.agents/skills/authoring-skills/CHANGELOG.md` | 61–62 | historical: `adding-vendor` → `adding-references`, `finding-vendors` → `finding-references`, `vendors` → `references` | history only, no change needed |
| `.agents/@montflow/profiles/bookkeeper/PROFILE.md` | 20–21 | `skills:` list includes `adding-references`, `finding-references` | consumes both old names |
| same | 46 | table row `References \| .agents/references/<name>/ \| cloned third-party repo… \| **manual structure check** \| adding-references, finding-references` | explicitly declares reference verification **manual** — the gap SPEC closes |
| `packages/linting/README.md` | 61–62 | "See the vendored anti-slop plugin at `tooling/oxlint/anti-slop/` … Reference clone (read-only): `.agents/references/anti-slop`." | consumer of the `anti-slop` row/clone |
| `.agents/skills/finding-references/GATES.md` | 10 | "Reference registry table is accurate and up to date" checkbox | prose gate, no command |
| `.agents/skills/adding-references/SKILL.md` | 54, 88 | tells the agent to edit `finding-references/SKILL.md` | coupling between the two skills |

**Docs the SPEC says name the reference surface — today they are silent**
(`grep -in refer README.md AGENTS.md .agents/documentation/*.md` → **no
matches**; `INSTALL.md` has only the heading `## Quick Reference` at 86):

| Artifact | Lines that must grow a references entry | Current content |
|---|---|---|
| `README.md` | package list 6–14 (rows 8–14; `@montflow/reviews` at 12, `@montflow/skills` 13) | 7 packages, **no `@montflow/references`** |
| `README.md` | sync-skill matrix 41–45 (per-plugin skill mapping); verify block heading 70, commands 72–76 | maps skills/specs/profiles/prompts/reviews only |
| `INSTALL.md` | plugin list 45–49 (enumerated 47–48: specs, profiles, prompts, reviews, skills, workspace) | no references plugin |
| `AGENTS.md` | 53–62 gate prose; 66–70 "Utility verifies, each runnable alone: `mf:check:skills`, `:prompts`, `:specs`, `:profiles`, `:reviews`"; 74–76 skills discovery | no `mf:check:references` |
| `.agents/documentation/author-mf-utility-cli.md` | CLI surface table 15–21 (5 rows: profiles, prompts, reviews, skills, specs); note line 23 "`opencode` … and `workflows` are libraries. No CLI."; gate prose 73–77 "Each CLI backs `mf:check:<domain>`"; steps 83–91 | no references row, no `mf-references` |
| `.agents/documentation/release-format-package.md` | 1–25 | no reference mention at all |

**Scripts and CI (no references anywhere):**

| Artifact | Lines | Evidence |
|---|---|---|
| `package.json` | 16–40 scripts | `pack:plugins` 29; scopes 30–34 (`mf:check:skills/prompts/specs/profiles/reviews`); `mf:check` 35 chains exactly those five; `mf:gate:fast` 36; `mf:gate` 37. No `mf:check:references`, no `references` package script, no bin |
| `.github/workflows/verify.yml` | matrix `include` 137–160 | cells: lint 139–140, format 141–142, typecheck 143–144, test 145–146, tui 147–148, smoke 149–150, skills 151–152, prompts 153–154, specs 155–156, profiles 157–158, reviews 159–160. **No references cell.** Each cell runs a root script (178–179) |
| `.github/workflows/release.yml` | 103, 112, 152–153 | per-package matrix (`bun run --filter ${{ matrix.package }} …`); nothing reference-specific |
| `lefthook.yml` | 3–6 comment, 19–27 `pre-push` | comment enumerates "every extension verify (skills, prompts, specs, profiles, reviews)"; hook runs `bun run mf:gate:fast` (24) |
| `tooling/pack` | `src/` + `package.json` | discovery via `exports./server`; no reference package exists to discover (`grep mf-references` → 0 matches) |
| `packages/` | directory list | `core, format, linting, opencode, profiles, prompts, reviews, skills, specs, stlx, workflows` — **no `packages/references`** |
| `.agents/@montflow/` | directory list | `dashboard, pi-prompts, profiles, prompts, review-presets, reviews, specs` — all committed except `reviews`, which is gitignored at `.gitignore:255` — **no `references` store** |
| `.agents/skills/` | 46 skill dirs | both generic skills present; zero `montflow-*reference*` skill dirs |

**Downstream consumers of the pinned `opencode` clone** (10 spec files, matching
SPEC.md:22–23 "Ten spec files cite"):

```
.agents/@montflow/specs/montflow-opencode-migration/A002-explore-opencode-plugin-api/MEMORY.md
.../A003-explore-session-engine-gap/MEMORY.md
.../A004-explore-workspace-ui-port/MEMORY.md
.../A005-explore-packaging-and-verification/MEMORY.md
.../A006-synthesize-migration-contract/MEMORY.md
.../B001-decide-package-architecture/MEMORY.md
.../B002-decide-adapter-seams/MEMORY.md
.../B003-decide-session-engine-mapping/MEMORY.md
.../B004-decide-workspace-integration/MEMORY.md
.../B006-plan-verification-and-distribution/MEMORY.md
```

They cite `.agents/references/opencode/` at tag `v2.0.18` (commit `cd9a14a`
per A005 line 8) — a pin with **no** representation in the registry.

### 6. Missing capabilities (explicit list)

1. **No store.** `<root>/.agents/@montflow/references/` does not exist
   (`ls -d` → No such file or directory); `.agents/@montflow/` holds
   dashboard, pi-prompts, profiles, prompts, review-presets, reviews
   (gitignored at `.gitignore:255`), specs; the other six stores are
   committed. Zero `REFERENCE.md` files repo-wide.
2. **No machine-readable registry.** The only registry is prose:
   `finding-references/SKILL.md:56–71`. No JSON, YAML, TOML, frontmatter entry,
   or per-reference file. Parsing it requires markdown table scraping.
3. **No verifier.** Nothing checks registry shape, URL validity/reachability,
   clone presence, git validity, cleanliness, or ref match. `bookkeeper/PROFILE.md:46`
   labels references "manual structure check"; `finding-references/GATES.md:10`
   is a human checkbox. No `mf-references`, no verify engine.
4. **No lifecycle.** No `add`/`update`/`sync`/`status`/`remove`. The whole
   lifecycle is 7 hand-run commands split across two skills (§1, §2), with no
   `ref` handling, no dirty-worktree guard (`git pull` at `adding:65`, also
   listed at `:89`; the `git reset --hard HEAD` escape at `:79`, `:90`), no
   failed-clone rollback, and no add→update routing.
5. **No CLI.** No `packages/references` directory, no `bin`, no
   `src/apps/cli`, no slash parser. `grep -rn "mf-references"` across the repo
   (excluding this spec) → **0 matches**.
6. **No tools / slash command.** `grep -rn "reference_add\|reference_find"` and
   `"montflow-add-reference\|montflow-find-reference"` (excluding this spec) →
   **0 matches**. No `reference_*` tool in any server entry.
7. **No doctor.** Nothing installs, freshness-checks, or scaffolds the
   reference skills; nothing ensures `.agents/references/` + `.gitkeep` exist or
   that `.gitignore` carries the rule (only skill prose at `adding:29–36`).
   `author-mf-utility-cli.md:43` defines the canonical `doctor` contract, but no
   package implements it for references.
8. **No `mf:check` scope.** `package.json:35` chains five scopes and
   `30–34` define five; `verify.yml:151–160` has five matching CI cells;
   `AGENTS.md:66–70` and `lefthook.yml:3–5` enumerate five. No
   `mf:check:references` anywhere.
9. **No packaging path.** `pack:plugins` discovers packages via `exports./server`;
   no reference package exists, so no `dist/pack/@montflow__references`.
10. **No URL validation.** No row-level check that a URL is well-formed,
    reachable, or still resolves; no `git ls-remote` equivalent.
11. **No drift control.** The `Path` column (56–71) duplicates the derived
    `.agents/references/<slug>` path in prose, so registry and filesystem can
    disagree without detection.
12. **No ref pinning.** No `ref` column/field, yet specs depend on
    `opencode` @ `v2.0.18`. A fresh clone lands on default HEAD, silently
    breaking the citation contract SPEC.md:66 requires preserving.
13. **No namespacing.** Skills are `adding-references` / `finding-references`;
    the `montflow-*` namespace and embedded-payload skill install do not exist.
14. **No error contract.** Failures are shell output (`ls`, `git clone` stderr)
    with no displayable failure string, no exit-code discipline, no
    `--human`/`--verbose`/`--check` flags.

### 7. Consistency observations worth carrying into B/D

- Version parity holds: both skills declare `2.2.0` (`adding:6`, `finding:6`),
  matching SPEC.md:15–16. Ids exist and are immutable (`adding:4`,
  `finding:4`) — renaming to `montflow-*` must preserve or replace them per
  `authoring-skills` rules.
- Group mismatch: `adding-references` declares `git` + `workflow`
  (`SKILL.md:10–12`), **not** `references`, while `authoring-skills:207` lists it
  as an example of the `references` group. `finding-references` declares
  `references` + `workflow`. A rename must decide what happens to the
  `references` taxonomy row.
- Cross-skill coupling: `finding:73` points to `adding-references`;
  `adding:54,88` instruct editing `finding-references/SKILL.md`. Neither file
  references a store or CLI — the SPEC's "never hand-edit a registry" changes
  both bodies, not just the table.
- The `# Reference` section of `finding-references` is the whole registry plus
  the READ ONLY warning (52–73); the warning has no machine enforcement.
- README/INSTALL/AGENTS/documentation silence means SPEC.md:72's doc work is
  **additive** (new rows/sections), not corrective — relevant to D002 scope.
- `packages/linting/README.md:61–62` and `bookkeeper/PROFILE.md:20–21,46` are
  the two non-skill docs that hard-code reference names/paths; `authoring-skills`
  is the third. Any rename must sweep all three plus the spec citations.

## Open Questions

1. **All 14 clones are absent in this worktree** (gitignored, fresh checkout);
   the sibling worktree `/home/daniel/dev/montflow/main` holds `opencode` and
   `pi-subagents` (A003 §2), so a real ref-mismatch fixture exists there.
   Is that the expected baseline for C007/D002, or does someone intend to
   materialize them before `--clones` verification is exercised? No network
   fetch was attempted here (out of scope).
2. **Ref encoding for `opencode`.** Specs cite `v2.0.18` (`cd9a14a`) but the
   registry has no ref field. Should C007 encode `ref: v2.0.18` in
   `opencode/REFERENCE.md`, and should `sync`/`update` check it out? (B001/B002
   decision; contract at SPEC.md:53, 56–57, 66.)
3. **Slug derivation rules.** With `effect` → `effect-smol` and `sveltekit` →
   `kit`, a URL-basename slug would rename two existing rows. Does `add`
   prefer `--name`/registry precedent over repo basename? (SPEC.md:55 allows
   `--name`; B001 should fix the rule.)
4. **URL normalization on migration.** 7 rows carry `.git`, 7 do not. "Migrated
   verbatim" (SPEC.md:66) vs canonical URL comparison in `add`'s duplicate check
   (SPEC.md:55) need one rule.
5. **`.gitkeep` vs ignore rule.** `.gitignore:257` also covers
   `.agents/references/.gitkeep` under `--no-index`; the file is tracked only
   historically. Should `doctor`/`add` add a `!.agents/references/.gitkeep`
   negation or rely on `git add -f`? (SPEC.md:54 requires `.gitkeep` present
   *and* clones ignored.)
6. **Group taxonomy after rename.** `authoring-skills:207`'s `references` group
   exists solely for these two skills; does D001 keep the row (repointed to
   `montflow-add-reference`/`montflow-find-reference`) or delete it as obsolete?
7. **Manual-verification row.** `bookkeeper/PROFILE.md:46` says reference
   structure is verified manually; after `mf:check:references` lands it should
   name the command — confirm D002 owns that row (it is not in SPEC.md:72's
   enumerated list).
8. **No phase scaffolding.** No `PHASE.md`/`BOARD.md`/`MAILBOX.md` exists for
   this spec, so the profile's steps 5 (BOARD broadcast) and mailbox addressing
   could not be performed. Is the orchestrator collecting handoffs purely from
   task `MEMORY.md` files?

## Handoff

- **A002 / A003 (parallel exploratory):** the reference surface is *not* a
  package — do not look under `packages/`; package anatomy must be modelled on
  `packages/{skills,profiles,reviews}` (their `skills/`, `src/apps/cli`,
  `src/modules`, doctor, payload generator). Consumers to trace for A003:
  `bookkeeper/PROFILE.md:20–21,46`; `authoring-skills/SKILL.md:200,206,207`;
  `packages/linting/README.md:61–62`; the 10 `montflow-opencode-migration`
  MEMORY files; `tooling/oxlint/anti-slop/`; plus every doc in §5 that must
  gain a row.
- **B001 (store contract):** migrate 14 rows verbatim from
  `finding-references/SKILL.md:56–71`; drop the `Path` column (derived);
  decide `ref` encoding for `opencode` (`v2.0.18`/`cd9a14a`) and URL
  normalization; decide slug override rules for `effect`/`sveltekit`.
- **B002 (git lifecycle):** current baseline is 7 raw commands (§1, §2) with no
  dirty guard, no ref checkout, no rollback; `add` appends prose to another
  skill. `update` must fast-forward default-branch entries and honor `ref` pins
  (SPEC.md:56); `sync` must clone missing + checkout refs without touching the
  store (SPEC.md:57); `status` states missing/present/dirty/ref-mismatch (+ behind/
  ahead with `--fetch`, SPEC.md:58).
- **B003 (CLI/tools):** no CLI, no slash, no tools exist (`mf-references`,
  `reference_add`, `reference_find`, `/mf-references` all 0 matches). Canonical
  verb/flag contract to follow: `.agents/documentation/author-mf-utility-cli.md:15–21,25–77`;
  gate wiring: `package.json:29–37`, `verify.yml:137–160`, `lefthook.yml:3–5,19–27`,
  `AGENTS.md:53–70`.
- **C001–C007:** authoritative inputs are §3 (14 rows + URLs), §4 (clone root,
  `.gitkeep` tracked by `5f10e35`, `.gitignore:257`), §5 (docs to extend), §6
  (nothing to preserve for a verifier — it must be built).
- **D001 (align skills):** both `SKILL.md` bodies carry the table and the
  hand-edit instruction (`finding:52–73`, `adding:52–58,84–90`) and both must be
  repointed to the CLI; group mismatch (`adding` declares `git`+`workflow`,
  taxonomy lists it under `references`) needs a decision; `bookkeeper` profile
  + `authoring-skills` taxonomy + `packages/linting/README.md` complete the
  sweep.
- **D002 (align docs):** README 6–14/41–45/70–76, INSTALL 45–49,
  AGENTS 53–70, `author-mf-utility-cli.md` 15–21, plus the §5 "silent" list —
  all additive; the docs currently contain zero reference mentions, so a
  missing row after D002 means the work was skipped, not misplaced.

## Deviations

- **No `BOARD.md` entry and no `MAILBOX.md` note.** The profile's work order
  (steps 5–6) and TASK's write restriction agree on writing only `MEMORY.md`,
  and the spec directory contains no `BOARD.md`/`MAILBOX.md`/`PHASE.md` to
  append to. Handoff therefore lives in the section above; flagged as Open
  Question 8.
- **No mechanical gate run.** The task is exploratory with no `GATES.md` in its
  directory and `Gates: No` in SPEC line 79; nothing to execute. Findings are
  evidence-backed commands whose outputs are quoted inline, for a reviewer to
  spot-check.
- **No network verification** of the 14 URLs or clone existence beyond the
  local filesystem, because TASK asks for inventory, not validation, and no
  clones may be created (out of scope). Recorded as Open Question 1.
- **Read-only otherwise.** No product/skill/doc file modified; the only write is
  this `MEMORY.md`. No timestamps, ids, or statuses invented.
