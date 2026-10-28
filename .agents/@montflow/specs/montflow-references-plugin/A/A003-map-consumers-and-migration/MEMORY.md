# Memory

## Context

A003 maps who consumes the current reference workflow and what the migration to
`@montflow/references` must touch. Downstream B001 (store contract), B003 (CLI
surfaces), and C007 (migration + gate wiring) depend on the facts below.
Citations were re-anchored to the current SPEC.md after phase E added three
description lines and three requirements; requirement text remains
authoritative over any line number.

State of the checkout this task ran in (`/home/daniel/dev/montflow/reference-plugin`,
a fresh worktree at HEAD `a94972e`):

- `.agents/references/` contains **only `.gitkeep`** — no clones at all. This is
  exactly the CI shape, so it doubles as the "fresh checkout" experiment.
- `.gitkeep` is tracked: `git ls-files .agents/references` →
  `.agents/references/.gitkeep`.
- The ignore rule is `.gitignore:257` (`.agents/references`), inside the block
  starting `# --- montflow skills workspace ---` at `.gitignore:254`.
- A sibling worktree `/home/daniel/dev/montflow/main` **does** hold clones
  (`opencode`, `pi-subagents`), and its `opencode` clone is on branch `dev` at
  `23e3493ab2` — i.e. **not** the pinned ref (see Findings §2).
- No phase-level `MEMORY.md`, `BOARD.md`, or `MAILBOX.md` exists for this spec
  yet; the task directory held only the placeholder `MEMORY.md`.

## Progress

- Read `PROFILE.md`, `SPEC.md`, `TASK.md`.
- Enumerated every path citation of `.agents/references/` across the repo
  (`rg`), separating spec consumers from product/docs consumers.
- Inventoried the vendored `tooling/oxlint/anti-slop/` copy: files, provenance
  statements, registration, and whether anything actually verifies it.
- Reconciled the `opencode` pin: prose citations vs the real clone in the
  sibling worktree (`git rev-parse v2.0.18` → `cd9a14a6b6…`).
- Built the 14-row → store-entry map with proposed purpose/added metadata.
- Mapped migration edits (deletes, creates, keep-list, doc edits) and the
  CI-safe assertion boundary.
- No mechanical gates exist for this task (`GATES.md` absent; SPEC marks A003
  `Gates: No`). Completion is the three checklist items in `TASK.md`.
- Wrote only this file. Nothing outside `.agents/@montflow/specs/` was modified.

## Findings

### 1. Consumers

#### 1a. Spec files citing the pinned `.agents/references/opencode/` clone — exactly 10

All are `MEMORY.md` files under
`.agents/@montflow/specs/montflow-opencode-migration/` (SPEC.md:22-23 says "Ten
spec files"; this is the set):

| # | File (relative to `.agents/@montflow/specs/montflow-opencode-migration/`) | Lines | What it cites |
|---|----------------------------------------------------------------------------|-------|---------------|
| 1 | `A002-explore-opencode-plugin-api/MEMORY.md` | 6-7, 11 | "pinned reference clone … at tag `v2.0.18`"; "every primary claim below cites the v2.0.18 clone" |
| 2 | `A003-explore-session-engine-gap/MEMORY.md` | 8 | ``@ `v2.0.18` (`packages/core/src/session/**` …)`` |
| 3 | `A004-explore-workspace-ui-port/MEMORY.md` | 8, 73 | clone @ `v2.0.18`; `packages/plugin/package.json:40-45` |
| 4 | `A005-explore-packaging-and-verification/MEMORY.md` | 8-9, 24, 128-129 | "at tag `v2.0.18` (commit `cd9a14a`)"; `packages/plugin/package.json:12-18`; `package.json` effect pin |
| 5 | `A006-synthesize-migration-contract/MEMORY.md` | 40 | `packages/core/src/session.ts:122` |
| 6 | `B001-decide-package-architecture/MEMORY.md` | 11, 90 | `packages/plugin/package.json`, `src/host.ts`; `packages/plugin/src/host.ts:17-44` |
| 7 | `B002-decide-adapter-seams/MEMORY.md` | 8, 248 | `packages/plugin/src/**` @ `v2.0.18`; `packages/core/src/session.ts:122` |
| 8 | `B003-decide-session-engine-mapping/MEMORY.md` | 11 | pinned clone @ `v2.0.18` |
| 9 | `B004-decide-workspace-integration/MEMORY.md` | 11 | pinned clone @ `v2.0.18` |
| 10 | `B006-plan-verification-and-distribution/MEMORY.md` | 177 | `opencode/AGENTS.md` "Live V2 TUI Testing" |

Metadata mentions (not consumers, they describe the same fact):
`A003-map-consumers-and-migration/TASK.md:26` and
`montflow-references-plugin/SPEC.md:23`.

No spec uses the clone as a build/test input; every citation is a **provenance
footnote for a claim** (line-numbered source reads). Consequence: the migration
never has to make these specs resolvable at runtime — it has to keep the
`opencode` entry registered with a pin that names `v2.0.18`, so a reader can
re-clone and reproduce the cited lines.

#### 1b. Vendored `tooling/oxlint/anti-slop/`

- **What it is**: vendored copy of the `anti-slop` Oxlint rule plugin — two
  plugins (`anti-slop`, `anti-slop-effect`), 16 rule modules (15 anti-slop + 1
  anti-slop-effect) + 13 `.test.ts` files, 3 shared helpers, `index.ts` per
  plugin, `LICENSE`.
- **Vendored from**: `dmmulroy/anti-slop` (MIT) `src/` — stated at
  `tooling/oxlint/README.md:32-40` ("vendored (not a fixed npm dependency) at
  `anti-slop/` per its README — MIT licensed, copied from `dmmulroy/anti-slop`
  (`src/`)"), `tooling/oxlint/package.json:6` (description), and
  `oxlint.config.ts:33-35` ("Source: tooling/oxlint/anti-slop/ (MIT,
  dmmulroy/anti-slop)"). Copyright holder "Dillon Mulroy" in
  `tooling/oxlint/anti-slop/LICENSE:3`. The registered reference row is
  `anti-slop → https://github.com/dmmulroy/anti-slop.git`
  (`finding-references/SKILL.md:68`).
- **Registration / coupling**: `oxlint.config.ts:36-62` enables 16 rules
  (`anti-slop/*` error except 5 warns; `anti-slop-effect/*` error);
  `oxlint.config.ts:77-78` registers both plugin specifiers. If those files were
  moved, the vendored copy and the repo's whole lint gate break.
- **Deliberately exempt from the repo's own checks**: `oxlint.config.ts:19`
  ignores `tooling/oxlint/anti-slop/**`; `.oxfmtrc.json:14` ignores the same
  path. And `tooling/oxlint/package.json` declares **no scripts, no tsconfig,
  no `vitest.config.ts`** → `turbo test` / `turbo ts:check` never reach the 13
  vendored `.test.ts` files. The vendored copy is a *prose* provenance claim,
  not a verified one. (Relevant to the "vendored copy does not change
  behaviour" requirement — nothing today would catch it changing.)
- **Only clone-path claim in product code**: `packages/linting/README.md:61-62`
  "See the vendored anti-slop plugin … Reference clone (read-only):
  `.agents/references/anti-slop`." That clone **does not exist** in this
  worktree or in any sibling worktree on this machine, and cannot exist in CI.
- **Phantom skill name**: `oxlint.config.ts:35` says "Enabled at `error` per the
  install-anti-slop skill." No `install-anti-slop` skill has ever existed —
  `git log --all --diff-filter=A --name-only` finds no such directory; the
  string was introduced with the toolchain migration (`1b7fb46`).

#### 1c. Code or tests reading a clone — none

`rg` over all `*.ts|*.tsx|*.js|*.mjs|*.json` (excluding `node_modules` and the
vendored tree) finds **no** filesystem access to `.agents/references/`. The only
non-prose hits are `oxlint-disable-next-line` comments naming rules
(`packages/opencode/src/modules/ports/ports.module.ts:1-33`,
`packages/skills/src/server.ts:6`, `packages/prompts/src/server.ts:5`,
`packages/prompts/src/modules/prompts/prompts.module.ts:72`,
`packages/linting/src/rules/no-node-platform-imports.ts:44`) and one prose
comment `packages/linting/src/shared/effect-services.ts:58`. So the clones are
**human/agent-read sources only**; no build, test, import, or typecheck touches
them. That is what makes the CI-safe boundary (Findings §5) clean.

#### 1d. Docs and artifacts naming the retired skills

| File | Lines | Content | Disposition |
|------|-------|---------|-------------|
| `.agents/skills/authoring-skills/SKILL.md` | 200 | `workflow` group examples include `adding-references` | repoint to `montflow-add-reference` |
| `.agents/skills/authoring-skills/SKILL.md` | 206 | `git` group examples include `adding-references` | repoint |
| `.agents/skills/authoring-skills/SKILL.md` | 207 | `references` group: `finding-references, adding-references` | repoint both |
| `.agents/@montflow/profiles/bookkeeper/PROFILE.md` | 20-21 | skill list includes `adding-references`, `finding-references` | replace with the two `montflow-*` skills |
| `.agents/@montflow/profiles/bookkeeper/PROFILE.md` | 46 | ledger row "References \| `.agents/references/<name>/` \| … \| manual structure check \| `adding-references`, `finding-references`" | row must become the committed store (`.agents/@montflow/references/<slug>/REFERENCE.md`) with verifier `bun run mf:check:references` |
| `.agents/skills/finding-references/SKILL.md` | 73 | "To add a new reference, use `adding-references` skill." | dies with the directory |
| `.agents/skills/adding-references/SKILL.md` | 54, 88 | "Add the reference to `.agents/skills/finding-references/SKILL.md` table" | dies with the directory |
| `.agents/skills/authoring-skills/CHANGELOG.md` | 61 | historical rename note (`adding-vendor` → `adding-references`) | leave as written (history) |

Docs that must **gain** a references surface (they mention none today — verified
by `rg -n "references|Reference" README.md INSTALL.md AGENTS.md`: one unrelated
hit, the `## Quick Reference` heading at `INSTALL.md:86`):

- `README.md:6-14` package list (no `@montflow/references` bullet).
- `README.md:41-45` extension-bound skill matrix — has rows for skills, specs,
  profiles, prompts, reviews only; needs
  `@montflow/references -> montflow-add-reference, montflow-find-reference`.
- `README.md:62` and `README.md:70-76` "montflow-ify" plugin loop / doctor loop
  (`for p in skills specs profiles prompts reviews`) omit references.
- `INSTALL.md:45-49` plugin list (enumerated 47-48) omits `references`.
- `AGENTS.md:66-70` lists 5 `mf:check:*` scopes; needs `:references`.
- `AGENTS.md:27,33-34` scope naming contract (unchanged, but the new scope must
  conform).
- `.agents/documentation/author-mf-utility-cli.md:15-21` CLI surface table has
  rows through `specs`; needs a `references | mf-references | …` row.
- Root `package.json:30-34` — `mf:check:references` script + inclusion in
  `mf:check` (line 35).
- `.github/workflows/verify.yml:137-160` matrix — needs
  `- target: references / script: mf:check:references`.

### 2. Pinned-ref facts

- **Which clone**: `opencode` — registry row
  `finding-references/SKILL.md:70`,
  `opencode | .agents/references/opencode | https://github.com/sst/opencode.git`.
- **Where the pin is written**: *only in spec prose*, never machine-readable:
  - `…/montflow-opencode-migration/A005-explore-packaging-and-verification/MEMORY.md:8`
    — "`.agents/references/opencode/` at tag `v2.0.18` (commit `cd9a14a`), the running"
  - `…/A002-explore-opencode-plugin-api/MEMORY.md:6-7` — "pinned reference clone
    `.agents/references/opencode/` at tag / `v2.0.18`"
  - `…/B002-decide-adapter-seams/MEMORY.md:8`, `…/B003…/MEMORY.md:11`,
    `…/B004…/MEMORY.md:11`, `…/A003…/MEMORY.md:8`, `…/A004…/MEMORY.md:8` — same `v2.0.18`.
  - Nothing in the repo stores the ref: the clone is gitignored
    (`.gitignore:257`), and the only committed artifact naming it is the prose
    above. There is no `.gitmodules`, no lockfile entry, no metadata file.
- **Pin is real and resolvable**: in the sibling clone
  `/home/daniel/dev/montflow/main/.agents/references/opencode`,
  `git rev-parse v2.0.18` → `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`; the
  same clone's `git describe` on its checked-out state is
  `vscode-v1.0.0-45-g23e3493ab2` on branch `dev` — i.e. **today's local clone is
  NOT at the pin** and `status` should report `ref-mismatch`.
- **Migration proposal (B001 decides; not an obligation)**: the `opencode` store
  entry is *proposed* to carry `ref: v2.0.18`. B001 chooses between tag-only
(`v2.0.18`), commit-only (`cd9a14a`), or tag plus the commit in the body notes;
the tag is what the prose quotes and the commit is immutable. Whatever B001
picks, C007 must not write it before that sign-off. No
other one of the 14 rows has any recorded ref, so the other 13 are
default-branch entries.
- **`update` semantics that follow**:
  - *Pinned entry* (`ref` present): fetch, then check out the recorded ref
    (detached HEAD), verify `HEAD` equals the resolved ref, and **never**
    fast-forward the branch — a pinned entry must stay byte-identical to the ref
    the specs cite. Moving the pin is a store edit, not an `update`.
  - *Default-branch entry* (no `ref`): fetch and fast-forward only
    (`--ff-only`); refuse on divergence rather than merge/rebase, and refuse a
    dirty worktree unless `--force` (SPEC:56).
  - *Both*: `update` must derive the target from the entry, not from the
    currently checked-out HEAD — the existing clone is on `dev`, so inferring
    "the branch it is on" would silently drift away from the pin.
- **`sync` obligation**: clone missing entries, then check out each recorded
  `ref` for pinned entries; default-branch entries stay where `git clone` put
  them (SPEC:57). `sync` must never rewrite the registry.

### 3. 14-row → store-entry migration map

Source of truth: the table at `.agents/skills/finding-references/SKILL.md:56-71`
(header 56-57, rows 58-71). Columns in the source are **Reference | Path | URL** —
there is **no `purpose` and no `ref` column**, and no `added` metadata. Under
SPEC:66 "migrated verbatim" therefore applies to `name` and `url` only; `purpose`
and `added` must be **authored** (see Open Questions 1-2). Purposes below are
proposed one-liners, derived from each upstream repo's identity, not migrated
text; B001 signs off before C007 writes them.

| # | slug (= frontmatter `name` = dir) | url (verbatim from SKILL.md:58-71) | purpose (proposed — authored) | ref | added (derived: blame date the row line was introduced) | notes |
|---|-----------------------------------|-------------------------------------|-------------------------------|-----|----------------------------------------------------------|-------|
| 1 | `alchemy-effect` | `https://github.com/alchemy-run/alchemy-effect.git` | Infrastructure-as-code for Effect: typed cloud resources and deploy-time wiring. | — | 2026-07-22 | |
| 2 | `drizzle-orm` | `https://github.com/drizzle-team/drizzle-orm` | TypeScript ORM with SQL-like query builder and schema migrations. | — | 2026-07-22 | No `.git` suffix. Mixed suffixes are the norm: rows 2, 3, 5, 7, 8, 9, 10 have **no** `.git`, rows 1, 4, 6, 11, 12, 13, 14 do — URL normalization must not depend on it |
| 3 | `effect` | `https://github.com/Effect-TS/effect-smol` | Effect v4 source (`effect-smol`): the runtime the whole monorepo targets. | — | 2026-07-22 | **slug ≠ repo name** (`effect-smol`) — see §3a |
| 4 | `orpc` | `https://github.com/middleapi/orpc.git` | Typesafe RPC/API layer for TypeScript. | — | 2026-07-22 | |
| 5 | `shadcn-svelte` | `https://github.com/huntabyte/shadcn-svelte` | Svelte port of shadcn/ui component patterns. | — | 2026-07-22 | |
| 6 | `sveltekit` | `https://github.com/sveltejs/kit.git` | SvelteKit framework (routing, SSR, build). | — | 2026-07-22 | **slug ≠ repo name** (`kit`) — see §3a |
| 7 | `signoz` | `https://github.com/SigNoz/signoz` | Open-source observability platform (metrics, traces, logs). | — | 2026-07-22 | URL owner casing `SigNoz` — normalize case for dedupe |
| 8 | `workers-oauth-provider` | `https://github.com/cloudflare/workers-oauth-provider` | OAuth provider library for Cloudflare Workers. | — | 2026-07-22 | |
| 9 | `effect-cf` | `https://github.com/jbt95/effect-cf` | Effect runtime/integrations for Cloudflare Workers. | — | 2026-07-22 | |
| 10 | `vitest` | `https://github.com/vitest-dev/vitest` | Vite-native test runner used across the workspace. | — | 2026-07-22 | |
| 11 | `anti-slop` | `https://github.com/dmmulroy/anti-slop.git` | Oxlint rule plugin rejecting low-evidence TypeScript patterns; vendored at `tooling/oxlint/anti-slop/`. | — | 2026-09-04 | The row whose clone is **vendored into the repo**; purpose should reference the vendoring on purpose |
| 12 | `opentui` | `https://github.com/sst/opentui.git` | SST's terminal UI framework (OpenTUI) behind the TUI surfaces. | — | 2026-09-13 | |
| 13 | `opencode` | `https://github.com/sst/opencode.git` | OpenCode v2 host the plugins load into; pinned because 10 spec files cite it. | **`v2.0.18`** (= commit `cd9a14a`) | 2026-09-13 | Only pinned row. Purpose should say so. |
| 14 | `pi-subagents` | `https://github.com/nicobailon/pi-subagents.git` | Pi subagent implementation, kept as the historical reference for the retired pi surface. | — | 2026-09-13 | A clone exists in the `main` worktree (`main` @ `60905d1`) |

Derived `added` dates come from `git blame -L58,71` on the table: 10 rows
(lines 58-67) introduced by `7a7e403` (2026-07-22, the submodule→clone rewrite), `anti-slop`
by `5671bc5` (2026-09-04), and `opentui`/`opencode`/`pi-subagents` by `80c38ec`
(2026-09-13). These are line-introduction dates, not necessarily the first time
the reference was registered (the table was renamed from `finding-vendors`
earlier, `c0e3d2b`).

#### 3a. Slugs that do not round-trip from the URL

No row name is an **invalid** slug — all 14 match
`^[a-z0-9]+(-[a-z0-9]+)*$` (the `packages/skills` slug rule,
`skill.module.ts:17-18`). But two **URL-derived** slugs differ from the registered
name, which is a trap for `add`'s slug derivation (SPEC:55):

- `https://github.com/Effect-TS/effect-smol` → derived `effect-smol`, registered `effect`.
- `https://github.com/sveltejs/kit.git` → derived `kit`, registered `sveltekit`.

Re-adding either URL must therefore route to `update` (SPEC:55 "when the name or
URL is already registered") — dedupe has to key on the **normalized URL**
(strip `.git`, trailing `/`, lowercase host+path), not on the derived slug, or
the registry grows a duplicate `effect-smol` / `kit` entry pointing at an
already-registered repo. `drizzle-orm` (no `.git`) and `SigNoz` (owner casing) are
the same normalization problem in milder form.

### 4. Migration edit list (for C007)

**Delete** (both directories wholesale: `SKILL.md`, `CHANGELOG.md`, and
`finding-references/GATES.md`):

- `.agents/skills/adding-references/` — `SKILL.md` (+ `CHANGELOG.md`).
- `.agents/skills/finding-references/` — `SKILL.md` (+ `CHANGELOG.md` and
  `GATES.md`); this is
  also the file that holds the 14-row table (lines 56-71), so the table's only
  home disappears with it. Nothing else in the repo reads those dirs.

**Create** (one per row, 14 total):
`.agents/@montflow/references/<slug>/REFERENCE.md` with frontmatter
`name` (= slug), `url` (verbatim, table §3), `purpose`, `added`, optional `ref`
(`opencode` only). Body carries notes (for `opencode`: pin rationale + commit
`cd9a14a`; for `anti-slop`: vendored at `tooling/oxlint/anti-slop/`).

**Keep** (must not be deleted as "empty"):

- `.agents/references/.gitkeep` — tracked (`git ls-files`), 0 bytes.
- `.gitignore:257` `.agents/references` under the
  `# --- montflow skills workspace ---` block (line 254). `doctor` must assert
  this line exists; `add` must append it when absent (SPEC:54).

**Update docs** naming the retired skills: see Findings §1d table — minimum:
`.agents/skills/authoring-skills/SKILL.md:200,206,207` and
`.agents/@montflow/profiles/bookkeeper/PROFILE.md:20-21,46`. Add the new surface
to `README.md:6-14,41-45,62,70-76`, `INSTALL.md:45-49`, `AGENTS.md:66-70`,
`.agents/documentation/author-mf-utility-cli.md:15-21`, root
`package.json:30-35`, `.github/workflows/verify.yml:137-160`.

**Self-links that vanish with the directories** (no edit needed, just confirm
gone): `finding-references/SKILL.md:73` → `adding-references`;
`adding-references/SKILL.md:54,88` → `finding-references/SKILL.md` table.

**Stale claims worth fixing in the same pass** (D001/D002 own them):
`packages/linting/README.md:61-62` (nonexistent `.agents/references/anti-slop`
clone) and `oxlint.config.ts:35` (nonexistent `install-anti-slop` skill).

### 5. CI-safe assertion boundary

Committed and therefore assertable in a fresh checkout (`mf:check:references`,
which SPEC:67 defines as the CI-safe verifier **plus** `doctor --check`):

- every `.agents/@montflow/references/<slug>/REFERENCE.md` parses; frontmatter
  has `name`, `url`, `purpose`, `added`; optional `ref` is a plausible
  branch/tag/commit string; body present.
- `name` == directory name == a valid slug; no duplicate slug; no duplicate
  normalized URL.
- clone path derivation is consistent (`<root>/.agents/references/<slug>`) and
  no entry stores a path.
- `.agents/references/` directory exists and `.gitkeep` is present (it is
  tracked — safe in CI).
- `.gitignore` carries `.agents/references`.
- the two packaged skills are installed in `.agents/skills/` and byte-current
  with `packages/references/skills/` (doctor freshness, embedded-payload
  fallback included).

Must **not** be asserted in CI (only `verify --clones` / `status --fetch` may,
locally):

- clone present / is a git work tree;
- clean vs dirty;
- current ref, ref match against `ref`, behind/ahead counts;
- upstream reachability (network).

Evidence this boundary is real and not theoretical: `.gitignore:257` hides the
clones, `git ls-files .agents/references` returns only `.gitkeep`, this worktree
has zero clones, and the CI matrix runs each scope as a fresh `actions/checkout`
(`.github/workflows/verify.yml:129-179`). A clone-less checkout **must** verify
clean, so `mf:check:references` must never shell out to `git` inside
`.agents/references/`.

### 6. Risks

1. **Registry/clone drift.** Three distinct drifts:
   (a) *URL rot* — 14 hand-typed URLs, some without `.git`, one owner-cased
   (`SigNoz`); a moved/renamed upstream silently 404s only at clone time.
   (b) *Ref drift* — the pin exists only as prose; today's only local `opencode`
   clone is on `dev` @ `23e3493ab2`, not `v2.0.18` (`cd9a14a`). Without
   `ref` frontmatter + `status` refusing to call a dirty/mismatched clone
   "present", the specs' cited lines stop being reproducible.
   (c) *Slug drift* — `effect`/`effect-smol` and `sveltekit`/`kit` (§3a): a
   URL-keyed `add` that Trusts derived slugs forks the registry.
2. **Fresh worktree with no clones.** Any verb that assumes clones exist fails
   on the first fresh worktree or CI run — the state this very task ran in.
   `verify` (no `--clones`), `doctor --check`, `list`, `show`, `verify`'s
   skill-payload check must all pass with only `.gitkeep`. `sync`/`update`/
   `status` must degrade to `missing`, not crash. Guard: nothing in
   `mf:check:references` may call `git` under `.agents/references/`.
3. **Renamed skills breaking inbound links.** 5 live inbound references
   (Findings §1d) plus self-links in the two SKILL.md files. Deleting the
   directories first leaves `authoring-skills/SKILL.md:200,206,207` and
   `bookkeeper/PROFILE.md:20-21,46` pointing at paths that no longer exist — and
   `bookkeeper` is a *profile*, so a missing skill name in its `skills:` list is
   silent (no resolver check found in `.agents/@montflow/profiles`). Do the doc
   repoint in the same commit as the delete.
4. **Compiled binary losing its payload.** `mf-references` ships a binary
   (SPEC:51) and installs skills (SPEC:64). Precedent shows the failure mode
   exactly: `packages/skills/scripts/generate-embedded-skills.ts:8-16` documents
   that "`bun build --compile` does not expose" `import.meta.dirname`, so
   `doctor` "always reported it missing"; the fix is
   `embedded-payload.generated.ts` + `build:cli` running
   `generate:payload` first + `tests/embedded-payload.test.ts` asserting the
   embed equals `skills/` (`packages/skills/src/apps/doctor/doctor.apps.module.ts:20-23`
   resolves `import.meta.dirname/../../../skills`; `:137-171` prefers disk and
   falls back to the embed). `packages/references` must copy that triad or its
   binary ships skill-less.
5. **Docs claiming a scope that does not exist.** Two live instances today —
   `oxlint.config.ts:35` ("install-anti-slop skill", never existed) and
   `packages/linting/README.md:62` (clone that exists nowhere) — prove the class.
   Forward-looking instance: D002 must not document `mf:check:references` until
   the script exists in root `package.json`, and the reverse — shipping the
   script without README/AGENTS/CI rows — leaves the gate undiscoverable. Land
   script + docs + matrix cell together.
6. **Vendored copy is unverified (adjacent, out of migration scope).** 13
   vendored `anti-slop` test files never execute (`tooling/oxlint` has no
   `scripts`, no tsconfig, no vitest config), and the tree is excluded from
   oxlint (`oxlint.config.ts:19`) and oxfmt (`.oxfmtrc.json:14`). "No vendored
   copy changes behaviour" is a promise nothing currently enforces; the
   `anti-slop` store entry should at least record what it was vendored from so
   a future refresh can diff.

## Open Questions

1. **`purpose` text does not exist in the registry** — the source table has no
   purpose column and no purpose prose anywhere in the repo. §3 proposes one
   line per entry. B001 must decide: accept these authored purposes (and say in
   SPEC/comments that `purpose` is authored at migration, `name`/`url` are
   verbatim), or define a derivation (e.g. upstream repo description at
   migration time). "Migrated verbatim" (SPEC:66) cannot cover this field.
2. **`added` dates are not recorded.** Options: blame dates per row (§3:
   2026-07-22 / 2026-09-04 / 2026-09-13), or the migration date for all 14.
   B001 picks; C007 applies it uniformly.
3. **Pin representation**: tag `v2.0.18` (what the 10 specs quote) versus commit
   `cd9a14a` (immutable). Recommendation: `ref: v2.0.18`, commit in the body
   notes, and have `verify --clones` compare `HEAD` against the **resolved**
   commit so a moved tag is caught. B001 owns the call.
4. **How does `add` create a pinned entry?** SPEC:55 lists no `--ref` flag, yet
   a pinned entry has to be creatable/updatable by tooling. Options: `add
   --ref <ref>` (B003 adds the flag), or pinned entries are only hand-editable
   store files and `update` merely honors them. Needs a decision before C003.
5. **Duplicate detection key**: must be normalized URL (case, `.git`, trailing
   `/`), otherwise `effect` and `sveltekit` get re-added as `effect-smol` /
   `kit` (§3a). B001 (contract) + B003 (CLI) must both state it.
6. **Should stale claims be fixed here or later?** `oxlint.config.ts:35` and
   `packages/linting/README.md:62` are outside this spec's requirement list
   (they name no skill that this spec retires, and the anti-slop clone claim is
   true-ish by intent). Recommend D001/D002 fold them in as drive-by fixes;
   A003 makes no edit.
7. **Local clone on the wrong branch.** `/home/daniel/dev/montflow/main/.agents/references/opencode`
   is on `dev` @ `23e3493ab2`. Should `sync`/`update` fix it automatically
   (`update opencode`) or should `status` merely report `ref-mismatch`? SPEC:56
   and :58 imply `update` fixes it; flagging because it is the first real-world
   `ref-mismatch` fixture C003 can use.
8. **No phase-level `MEMORY.md`/`BOARD.md`/`MAILBOX.md` exists** for this spec,
   so the PROFILE's step-1 read set was unavailable. Nothing blocking; noted so
   the orchestrator knows the phase records are still to be created.

## Handoff

- **B001 (store contract)** needs: §3 map (slug/url/purpose/ref/added), §3a
  URL-normalization requirement, §2 pin representation choice, Open Questions
  1-3 and 5. Frontmatter contract must keep `purpose`/`added` mandatory but
  authored, and must not store a clone path (SPEC:53).
- **B003 (CLI surfaces)** needs: §2 update/sync semantics (pinned vs
  default-branch, resolve-don't-infer), §3a dedupe-by-URL, Open Question 4
  (`add --ref`), §5 boundary → `verify` vs `verify --clones`, `status` states
  `missing|present|dirty|ref-mismatch` (+`behind|ahead` with `--fetch`).
- **C007 (migration + gate)** needs: §4 edit list verbatim (2 deletes, 14
  creates, keep `.gitkeep` + `.gitignore:257`, doc repoints), §1d doc line
  numbers, and §5's "no `git` under `.agents/references/` in
  `mf:check:references`" rule.
- **C006 / D001 / D002** need: §1d inbound-link list (5 live hits), the
  doc-gain list in §1d, and risk 4's embedded-payload triad
  (`scripts/generate-embedded-skills.ts` precedent).
- **A001 / A002** overlap: A001 owns the full reference-surface inventory
  (clone root, `.gitkeep`, `.gitignore` line); this file's §1-§4 is
  consumer-and-migration scoped, so the same facts may appear there — no
  contradiction found as of this writing (A001/A002 were still placeholders).
- Reviewer of this exploratory task must judge: completeness of the consumer
  list (10 spec files + vendored copy + zero code readers), that every claim
  above carries a path:line, and that §5 does not assert a single clone fact.

## Deviations

- None in scope: only
  `.agents/@montflow/specs/montflow-references-plugin/A003-map-consumers-and-migration/MEMORY.md`
  was written.
- Read-only cross-worktree inspection: the `opencode` pin was verified against
  the clone in the sibling worktree `/home/daniel/dev/montflow/main` because
  this worktree has no clones (gitignored). No file there was modified.
- The PROFILE's step-1 context set (phase `MEMORY.md`, `BOARD.md`, own
  `MAILBOX.md`) does not exist yet in this spec; proceeded from `TASK.md`,
  `SPEC.md`, and repository evidence.
