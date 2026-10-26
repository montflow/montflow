# Memory

## Context

- Task: **B003 — decide-cli-and-plugin-surfaces** (planning), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin` (HEAD `a94972e`).
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Spec read: `SPEC.md` (1–101; requirements 51–73 authoritative, and
  the phase-E requirement at SPEC:70–71 is treated as in force for this task's
  scoped-invocation decisions).
- Task read: `.../B003-decide-cli-and-plugin-surfaces/TASK.md` (1–42).
- Dependency evidence consumed:
  - `B001-decide-registry-store-contract/MEMORY.md` (full file) — store path,
    frontmatter contract, derived clone path, duplicate policy, issue classes
    (34 ids incl. the clone-scope set), the CI-safe boundary, and the
    handed-over flag questions (§3, §11.3–7, §12).
  - `B002-decide-git-lifecycle/MEMORY.md` (full file) — verb semantics, exact
    messages, network policy, status vocabulary, output literals, exit table,
    and its own hand-offs (§12 seam, §11 literals).
  - `A002-map-package-anatomy/MEMORY.md` (1–694) — package anatomy, CLI
    layering, plugin entry/tool contracts, payload+doctor pattern, and the
    per-CLI scoped-invocation table (§10) that phase E must repair.
  - `A099-review-phase/MEMORY.md` (1–36) — phase A closed; citations are
    text-anchored.
- Live precedent read end to end: `packages/reviews/src/apps/cli/`
  (`engines`, `renderers`, `binary`, `slash`, `main`, `index`),
  `packages/reviews/src/server.ts`, `packages/skills/src/server.ts`,
  `packages/reviews/src/apps/doctor/doctor.apps.module.ts`,
  `packages/skills/src/modules/skill/skill.module.ts:270–383`,
  `packages/profiles/src/modules/skill-check/skill-check.module.ts:1–45`,
  `packages/reviews/skills/**`, `.agents/skills/{adding-references,
  finding-references}/SKILL.md`, `.agents/skills/authoring-skills/SKILL.md:190–208`,
  `.agents/documentation/author-mf-utility-cli.md` (1–100), root
  `package.json:20–45`, `.github/workflows/verify.yml:130–165`,
  root `AGENTS.md:20–75`.
- Re-verified repo facts this record depends on (not inherited):
  | Fact | Command | Result |
  |---|---|---|
  | ignore rule | `grep -n references .gitignore` | `257:.agents/references` |
  | placeholder tracked | `git ls-files .agents/references` | `.agents/references/.gitkeep` |
  | store path not ignored | `git check-ignore -v --no-index .agents/@montflow/references/effect/REFERENCE.md` | no output, exit 1 |
  | no store yet | `ls .agents/@montflow/references` | no such directory |
  | no package yet | `ls packages/references` | no such directory |
  | no `--human` anywhere | `grep -rn human --include=*.ts packages` | hits are prose/comments only |
- This is a **decision** task. Everything under Findings is a ruling C004–C007
  and D001/D002/E003 implement without renegotiating. Rejected alternatives
  appear only where the rejection is part of the ruling.
- Only file written: this `MEMORY.md`. No spec state, product code, skill, doc,
  gate, or other task directory was touched.
- Work-order sources that still do not exist: no `PHASE.md`, no `BOARD.md`, no
  per-task `MAILBOX.md`, no `GATES.md` for this task (SPEC:85 `Gates: No`).
  Same gap A001/A002/B001/B002 recorded; see Deviations.

## Progress

Done, in order:

1. Read `PROFILE.md`, `SPEC.md` (all 101 lines), `TASK.md`, the B001 and B002
   memories, A002, A099, and the placeholder `MEMORY.md` (21 lines).
2. Read the full `reviews` CLI stack and server, the `skills` server, the
   `reviews` doctor, the skills domain verifier, and the profiles skill-check
   lazy-import seam.
3. Read the two skills that this package replaces, the outbound review skill as
   a pipeline model, the `authoring-skills` groups taxonomy, and the CLI
   standard document.
4. Re-verified the six repo facts in the Context table; confirmed zero `--human`
   implementations and zero TUI panels in any plugin package.
5. Decided §1–§13 and wrote this file.
6. Ran the spec check (output verbatim in Deviations).

## Findings

### 1. Verb set and order — DECIDED

Canonical order, exactly as listed in help, `USAGE`, the docs table, and the
slash description:

| # | Verb | Class | One line |
|---|---|---|---|
| 1 | `doctor` | canonical | verify the workspace scaffolding and packaged skills; repair what it can |
| 2 | `list` | canonical | every store entry with its clone state and purpose |
| 3 | `show` | canonical | one entry: raw `REFERENCE.md` bytes |
| 4 | `verify` | canonical | CI-safe registry verification; `--clones` adds local clone truth |
| 5 | `add` | domain | register + clone one git URL (routes to `update` when registered) |
| 6 | `update` | domain | refresh one entry or `--all` by name or URL |
| 7 | `sync` | domain | materialize missing clones / repair local checkouts; never writes the store |
| 8 | `status` | domain | per-entry local state, optionally `--fetch` |
| 9 | `remove` | domain | unregister one entry, and its proven clone unless `--keep-clone` |

- Order is the shared standard's: canonical verbs first, domain verbs after
  (`author-mf-utility-cli.md:41–50`). It is also the order in `USAGE` and in
  `COMMAND_DESCRIPTION`, which the host shows for `/mf-references`
  (precedent `packages/reviews/src/apps/cli/slash.apps.module.ts:18–26`).
- **No aliases.** `verify` has no `check` alias (that spelling belongs to
  `mf-specs`, `author-mf-utility-cli.md:46`); `list` has no `ls`; `remove` has
  no `delete` alias even though `profiles`/`prompts`/`skills` spell CRUD
  `create`/`modify`/`delete` (`author-mf-utility-cli.md:17–20`). Reason: SPEC:61
  fixes the domain verbs as `add`, `update`, `sync`, `status`, `remove`, and a
  second spelling for the same engine doubles the parser table, the docs table,
  and the test matrix for zero behaviour.
- **Dropped: `new`.** `reviews` aliases `create`→`new`
  (`packages/reviews/src/apps/cli/binary.apps.module.ts:142–166`); `add` is not
  a scaffold, it clones, and it already routes to `update`.
- **Dropped: a `find` / `search` verb.** SPEC:61 fixes the verb set, and the
  tool that needs it is `reference_find` (SPEC:63). The capability is a pure
  domain predicate over `list` output plus `show` for the exact hit (§8), not a
  tenth verb with its own renderer and exit rule.
- **Dropped: `create`/`modify`.** The registry is authored by `add` +
  hand-edited prose only for notes; `add` writes the file after the clone
  succeeds (SPEC:55, B002 §3.5). A `modify` verb that rewrites frontmatter would
  be a second writer of the store with no spec requirement.
- **Dropped: `install`, `init`, `lock`, `state`, `next`.** Scaffolding is
  `doctor` (SPEC:59); the rest are `mf-specs` domain verbs
  (`author-mf-utility-cli.md:50`).
- **`help` is a keyword on the slash surface only**, exactly like `reviews`
  (`slash.apps.module.ts:29–31,113,162–163`); the binary gets `--help` from
  `effect/cli` for free (`author-mf-utility-cli.md:35`).

### 2. Flags and defaults per verb — DECIDED

Universal:

| Flag | Type | Default | Applies to |
|---|---|---|---|
| `--dir <path>` | string | `process.cwd()` | every verb |
| `--human` | boolean | `false` | every verb except `show` |
| `--verbose` | boolean | `false` | every verb except `show` |

`--flag value` and `--flag=value` are both accepted; an unknown flag is a usage
error, exit 1 (`author-mf-utility-cli.md:54–60`). `--dir` is the **workspace
root**, not the store: the store is `<root>/.agents/@montflow/references`, the
clones `<root>/.agents/references`, the skills `<root>/.agents/skills`
(`author-mf-utility-cli.md:54–55`, B001 §5).

| Verb | Positional | Flags (complete) | Defaults / usage rules |
|---|---|---|---|
| `doctor` | — | `--check --human --verbose --dir` | repairs by default; `--check` writes nothing |
| `list` | — | `--status installed\|missing --human --verbose --dir` | no filter = every entry; only those two values accepted |
| `show` | `<name>` (required) | `--dir` | `--human`/`--verbose` are **usage errors** (the file is the output) |
| `verify` | `[<name>]` | `--all --clones --human --verbose --dir` | no name and no `--all` = whole store; name + `--all` = usage error |
| `add` | `<url>` (required) | `--name <slug> --ref <ref> --purpose <text> --human --verbose --dir` | `--purpose` required for a new URL; `--name` overrides slug derivation; `--ref` pins |
| `update` | `[<name\|url>]` | `--all --force --human --verbose --dir` | exactly one of positional or `--all`; both or neither = usage error |
| `sync` | `[<name>]` | `--all --human --verbose --dir` | exactly one of positional or `--all` (SPEC:57 usage error; B002 §6.1) |
| `status` | `[<name>]` | `--fetch --human --verbose --dir` | no name = every entry; there is no `--all` (see below) |
| `remove` | `<name>` (required) | `--keep-clone --human --verbose --dir` | no `--force`; `--keep-clone` is the only escape hatch (§13.4) |

Rulings inside that table:

1. **Positional for addressing, `--name` only for creating.** Every existing
   entry is addressed by a positional `<name>`; `--name` exists only on `add`,
   where it chooses the slug to create. This follows B001's hand-off
   (B001:588–590) and the majority spelling (`show <name>` in
   `packages/reviews/src/apps/cli/binary.apps.module.ts:36–38,91–100`;
   `verify [<name>]` at `:102–109`), and it stops `--name` from meaning
   "address" in one verb and "create as" in another (`mf-specs` uses `--name`
   for addressing, `packages/specs/src/apps/cli/cli.apps.module.ts:886`).
2. **`list --status installed|missing` is filesystem presence, nothing more.**
   `installed` = the derived clone path exists (directory or symlink);
   `missing` = it does not. No git call, no network, no decoding of clone
   state — so `installed` ≠ `present` (B002 §9.1): a dirty or foreign path is
   still `installed`, and `status` remains the authority on clone truth. The
   pairing this buys is `list --status missing` → `sync <name>` / `sync --all`.
   Any other value is refused: `refused: unknown status '<v>'; use installed or
   missing`, exit 1.
3. **`verify` defaults to the whole store** when neither a name nor `--all` is
   given, copying `reviews` (`binary.apps.module.ts:116`) and letting
   `mf:check:references` spell `verify --all` explicitly. `--clones` composes
   with both forms.
4. **`status` has no `--all`.** Its natural default is already every entry
   (B002 §9.1: one line per entry, sorted), SPEC:58 gives it only
   `[name] [--fetch]`, and an `--all` flag that is indistinguishable from "no
   name" is surface with no meaning. The asymmetry with `verify`/`sync`/
   `update` is deliberate: those three verbs mutate or gate, so an explicit
   `--all` is a safety signal; `status` only reports.
5. **`sync` has no force flag.** This is B003's surface ruling and B002 now
   agrees: §6.2/§10 were amended in review round 001 (finding F7) to drop the
   force path entirely, and B002's sync section is the single source for the
   algorithm. Consequence (firm): `sync` never discards local work — a dirty
   clone is reported `skipped <slug> dirty (...)` with a hint naming
   `update <slug> --force`, and the repair path is `update <slug> --force`.
   **C004** implements the flag set from §2, which is closed — §1–§6 are C004's
   whole surface (§5, §14), engines and parser included. C003 fills the git
   module with `GitPort` only and implements no flag, no usage check, and no
   verb engine (B002 §12, F27/F28).
6. **`update --all` is sequential in slug order** (B002 §6.2 order), continues
   past a failing entry, reports every entry, and exits 1 if any entry did not
   end `present`. `--all` and `--force` compose.
7. **`add` exposes `--ref` and `--purpose`** — closing B001 OQ5 and B002 OQ1.
   `<url>` is **https-only**: ssh, scp-style, `file://`, and local-path arguments
   are refused before any clone with a "use the https URL" message (B002 §2.1,
   B001 §2 rule 5), so no entry can ever store a non-https `url`.
   Validation precedes routing and every write (B002 §3.1 steps 1–2): URL syntax,
   then `--purpose`/`--ref`/`--name` when passed, then the route decision. A
   passed `--purpose` must satisfy B001 §2 (non-empty, one line, 1–280 chars,
   ends with `.`, no `#`/`": "`), so `--purpose ""` — or any purpose `verify`
   would reject — refuses before routing and before any scaffold or clone (F19).
   `--purpose` is *required* only for a new URL, and that requirement is
   evaluated after the route decision and still before any write (B002 §3.1
   step 5); the route-to-`update` path therefore needs no purpose, which is why
   the flag stays optional in the `reference_add` schema (§8).
   `--ref` is the single opaque string of B001 §3; `add` resolves it exactly as
   B002 §3.3 and rolls back both clone and entry if it does not resolve.
8. **`remove` has no `--force`.** B002 OQ2 suggested one; TASK:25 gives
   `--keep-clone` instead, and the inverted default already answers the only
   question `--force` would: "don't touch my clone". See §13.4 for the full
   rule (dirty/foreign clones are never deleted, and `--keep-clone` is the way
   to unregister them).
9. **`show` takes no output-mode flags.** Its contract is "the artifact's
   bytes" — `reviews` prints `show` output with the identity renderer
   (`binary.apps.module.ts:99`), and a second layout would make `show` unusable
   as a byte source for an agent or a diff. Documented in `USAGE`; any other
   flag is a usage error like every other unknown flag.
10. **`doctor --check` is report-only and exits 1 on drift**; repair mode exits
    0 when everything ends usable (`author-mf-utility-cli.md:43,58,97`;
    precedent `packages/reviews/src/apps/cli/binary.apps.module.ts:65–83`).

### 3. Output modes — DECIDED

Two independent axes, four reachable combinations, no implication between them:

| Mode | Who uses it | Shape |
|---|---|---|
| agent default | binary default, **slash default, all tools** | one summary line plus one line per entry; lowercase tokens; `key=value` details; no glyphs, no colour, no box drawing, no progress output |
| `--verbose` | agent or human | adds fields to the same lines (`path=`, `url=`, `ref=`, `origin=`, `head=`, `upstream=`, passing verify entries); never removes, never reorders |
| `--human` | humans typing the binary or slash | aligned table with `✓`/`✗`/`•` marks; failures still printed as the issue blocks below the table |
| `--human --verbose` | humans | the same table with the extra columns |

- **`--human` does not imply `--verbose`.** If it did, "human but terse" would
  be unreachable, and the spec's word is *compose* (SPEC:62), not *subsume*.
  Renderers therefore take one options record,
  `interface RenderOptions { human: boolean; verbose: boolean }` — extending
  the existing `Verbosity` (`packages/reviews/src/apps/cli/renderers.apps.module.ts:27–29`),
  which currently carries one axis and is why `--human` has no precedent
  (A002 §9.1).
- **Slash mirrors the binary's flags.** `/mf-references list --human` and
  `--verbose` must work: `reviews`' slash parser rejects them
  (`slash.apps.module.ts:116–124` accepts only `check` for `doctor`, nothing for
  `list`), which A002 §4/§9.5 flagged as a contradiction with the shared
  standard. C004's slash `known` sets equal the binary's flag sets per verb
  (§2), and a test asserts that equality.
- **Tools always render agent default.** Tool output is model input; a table or
  glyph costs tokens and parses worse. The tools call the same engines and the
  same renderers with `{ human: false, verbose: false }`.
- **No glyphs in agent mode.** This deliberately differs from `reviews`, whose
  default `verify` prints `✓`/`⚠` (`renderers.apps.module.ts:79–82`). The rule is
  mechanical and has exactly two clauses:
  1. agent rows are `<token> <slug> [k=v …]` — plain ASCII tokens, so a parser
     can `split(' ')` and a test can assert exact strings;
  2. the four glyph characters (`✓`, `✗`, `⚠`, `•`) exist only in `--human`
     output. Agent default writes `error` / `warn` where `--human` writes
     `✗` / `⚠` (the verify block, B001 §7) and `ok` where `--human` writes `✓`.
  `renderers.test.ts` asserts clause 1 over every verb's default strings and
  asserts those four characters appear in none of them; the `--human` strings are
  asserted separately and may carry them. This is the single statement of the
  rule — B001 §7's rendered-shape paragraph and B002 §10/§11 cite it (F17).

Exact agent grammar per verb (B002 §11 vocabulary plus the three new tokens
`installed`, `missing` for `list` and `summary` for every multi-row verb):

| Verb | Agent default | `--verbose` adds |
|---|---|---|
| `doctor` | `summary checks=<n> failed=<n> repaired=<n>` + one `failed <check>: <detail>` / `repaired <check>: <detail>` line per non-ok check | `ok <check>` lines, and the payload origin (`package`/`embedded`) |
| `list` | `<state> <slug>  <purpose>` per entry, then `summary total=<n> installed=<n> missing=<n>`; `<purpose>` is `(no REFERENCE.md)` when the entry has no file | `url=<url>`, `ref=<ref>`, and a `  path: <derived>` line |
| `show` | the file, byte for byte | — |
| `verify` | one issue block per failing entry (`error <path> has <n> issues. Fix each one and run verify again.`, then `N. [field] message` / `Fix: …`, `warn [field] message`), then `summary entries=<n> issues=<n> warnings=<n>`; zero issues = `summary entries=<n> issues=0 warnings=<n>`; `✗`/`⚠` are the `--human` forms only (B001 §7, F17) | `ok <path>` per passing entry |
| `add` | **exactly one** line: `created <slug> <url>`; on routing, the notice `routed add -> update <slug>: <url> is already registered as <slug>` then update's own result line(s) (B002 §4.2, §11) | `path=`, `head=` |
| `update` | `updated <slug> head=<sha7>`, `present <slug>` (no-op), or `created <slug> <url> [@ <ref>]` when it materialized; `--all` ends with `summary total=<n> present=<n> failed=<n>` | `origin=`, `upstream=`, `path=` |
| `sync` | B002 §6.3 verbatim: `created`/`updated`/`ok`/`skipped`/`failed` rows, then `summary total=<n> created=<n> updated=<n> ok=<n> skipped=<n> failed=<n>` | `path=`, `head=` |
| `status` | B002 §9.1 verbatim: `missing <slug>`, `present <slug>`, `dirty <slug> files=<n>`, and `ref-mismatch <slug>` with one of B002 §8.3's details — `head=<sha7> expected=<sha7>`, `ref=<ref> unresolvable`, `branch=<b> expected=<default>`, or (under `--fetch`, a moved remote tag) `ref=<ref> expected=<sha7> remote=<sha7>`; with `--fetch`, `behind=<n>` then `ahead=<n>`, each only when non-zero (`present <slug> behind=1 ahead=2`); summary `summary total=<n> missing=<n> present=<n> dirty=<n> ref-mismatch=<n> foreign=<n>` | `path=`, `origin=`, `head=`, `upstream=` |
| `remove` | `removed <slug>`; with `--keep-clone`, `removed <slug> clone=kept` | `path=` |

Refusal/failure lines are B002's, unchanged and single-stream to stdout
(`refused: …`, `failed: …`), with the caller's invocation form threaded into
every fix-it hint (`author-mf-utility-cli.md:71`): `mf-references …` from the
binary, `/mf-references …` from slash, `mf-references …` inside tool strings.

### 4. Exit contract — DECIDED

Two codes only: `0` and `1`. Never `process.exit`; `process.exitCode = 1` is set
**inside the handler** through the one `exitFailed` helper
(`author-mf-utility-cli.md:36,64`; `packages/reviews/src/apps/cli/binary.apps.module.ts:61–63`),
and the slash front end never touches the process code at all — it
`Effect.fail`s with the rendered message and `server.ts` notifies
(`slash.apps.module.ts:200–224`, `server.ts:78–81`). Engines fail with a
**displayable string** (`engines.apps.module.ts:39`); renderers are pure. A
usage error (unknown flag, missing required positional, both/neither of
name/`--all`) prints a `usage:` line and exits 1.

| Verb | 0 | 1 |
|---|---|---|
| `doctor` | every check ok or repaired | any check failed; **also** `--check` with drift (missing/stale/mismatched/payload unavailable) |
| `list` | rows printed, whatever their state; an existing but empty store prints a zero-row summary | unknown `--status` value, **store root missing** (same rule and message as `verify`'s `store-root-missing`, §13.3) |
| `show` | file printed | unknown slug, unreadable file |
| `verify` | zero issues (a fresh checkout with zero clones verifies clean — B001 §11) | any issue; `--clones` git failure |
| `add` | entry registered, or routed `update` ended `present` | any refusal, clone/checkout/write failure |
| `update` | every selected entry ends `present` | any refusal/failure (with `--all`, any entry) |
| `sync` | every selected entry ends `present` | any skip or failure |
| `status` | **every selected entry was reported** — `missing`, `dirty`, `ref-mismatch` included | refusal only: unknown name, foreign path/not-a-repo, `--fetch` network failure |
| `remove` | entry removed (clone removed or kept) | unknown name, foreign path without `--keep-clone`, dirty clone without `--keep-clone`, unlink failure |

- **State finding vs refusal, explicitly:** only `doctor`, `verify`, `update`,
  and `sync` fail on a state they can see. `status` and `list` report; their
  non-zero is reserved for "the tool declines to answer" (SPEC:58, B002 §9.3).
  This diverges from `mf-specs status`, which exits 1 when the spec fails
  verification (`packages/specs/src/apps/cli/cli.apps.module.ts:886–898`):
  SPEC:58 overrides that precedent for this package, and the CI gate is
  `verify --clones`, not `status`.
- A warning (`warn` in agent mode, `⚠` in `--human`) never changes the exit code
  (B001 §7 severity table;
  `renderers.apps.module.ts:81–82`).

### 5. Engine / renderer split and tests — DECIDED

One engine set in `src/apps/cli/engines.apps.module.ts`, one pure renderer set in
`renderers.apps.module.ts`; the binary, the slash command, and both tools are
thin adapters over them (SPEC:61–63, `author-mf-utility-cli.md:69–71`). The
tools import the engine module directly — they are not routed through the slash
parser — so a CLI-only flag can never leak into a tool contract.

Engines (all take `StoreScope { cwd; dir? }` — copy of
`engines.apps.module.ts:19–24` — and fail with `string`):

| Engine | Returns | Notes |
|---|---|---|
| `doctor(cwd, {check, invocation})` | `Doctor.DoctorResult` | composes the CI-safe verify engine + scaffolding checks (§7) |
| `list(scope, {status?})` | `ReadonlyArray<ReferenceRow>` | `{ slug, purpose, url, ref?, installed, entryPath, path }` |
| `show(scope, name)` | `string` | raw bytes, no transform |
| `verify(scope, {name?, all, clones})` | `VerifyReport` / `VerifyAllReport` | one implementation, two shapes; `--clones` is the only git path |
| `add(fields)` | `AddResult` | `{ kind: 'created', slug, url, ref? } \| { kind: 'routed', slug, url, update: UpdateResult }` — the routed variant carries update's result so a caller cannot report success without it (B002 §4.2, F11); B002 §3 order verbatim |
| `update(scope, target, {force})` | `UpdateResult` | target classifies URL vs name (B002 §5.1) |
| `updateAll(scope, {force})` | `ReadonlyArray<UpdateResult>` | slug order, sequential |
| `sync(scope, {name?, all})` | `SyncReport` | no force (§2.5); no store writes (B002 §6.2) |
| `status(scope, {name?, fetch})` | `StatusReport` | shares the §8.3 comparison with `verify --clones` |
| `remove(scope, name, {keepClone})` | `RemoveResult` | §13.4 |

Renderers: `USAGE` (verb table, in §1 order), `RenderOptions`, `doctor`,
`list`, `verify`, `verifyAll`, `added`, `routed`, `updated`, `synced`,
`status`, `removed`, `gate` (delegates to `Doctor.doctorGateMessage`, precedent
`renderers.apps.module.ts:136–137`). No `show` renderer — bytes pass through.

Tests (Vitest, colocated, `vitest run --typecheck` per
`packages/reviews/package.json:38`):

| File | Test | Covers |
|---|---|---|
| `src/apps/cli/tests/engines.test.ts` | `lists installed and missing entries and filters by status` | `list` (fs-only, no git) |
| | `shows one entry and refuses an unknown slug` | `show` |
| | `verifies a fresh checkout with zero clones` | `verify` (B001 §11.6 fixture, exit-relevant) |
| | `reports clone-head for a pinned mismatch under --clones` | `verify --clones` (B002 §12.1; B001 §7 class names) |
| | `adds a reference, writes the entry after the clone, and routes a registered url to update` | `add` (B002 §4.2) — hermetic temp repo cloned **through the injected `GitPort`** (B002 §12): the port maps the https argument to the fixture path, so the https-only argument policy stays intact; a **separate** pure test asserts ssh/scp/file/path arguments are refused before the port is called |
| | `updates a clone, refuses a dirty one, and honours --force` | `update` + `updateAll` |
| | `syncs a missing entry, skips a dirty one, and leaves the store byte-identical` | `sync` |
| | `reports missing, present, dirty, and ref-mismatch offline and behind under --fetch` | `status` |
| | `removes an entry and its clone, keeps a dirty clone with --keep-clone, and refuses a foreign path` | `remove` |
| `src/apps/cli/tests/renderers.test.ts` | `renders every verb in agent mode with stable tokens and no glyphs` | every renderer, default — including the verify block's `error`/`warn` prefixes and the absence of `✓ ✗ ⚠ •` (F17) |
| | `renders every verb in human mode and composes with verbose` | `RenderOptions` matrix |
| | `USAGE lists the verbs in canonical order` | `USAGE` |
| `src/apps/cli/tests/slash.test.ts` | `parses every verb with exactly the binary's flags` | parser table = §2 |
| | `treats an unknown flag as help` | usage |
| | `threads --human and --verbose into the renderer` | A002 OQ3 regression |
| | `runs a verb end to end and notifies the rendered text` | `run` |
| `src/tests/server.test.ts` | `registers /mf-references and both tools` | entry (fake host, `packages/reviews/src/tests/server.test.ts:33–97` pattern) |
| | `reference_add registers and returns the created slug` | tool |
| | `reference_find returns an exact entry and candidate rows without dispatching a session` | tool + determinism |
| | `a tool refusal is a displayable string` | `defineTool` error mapping (`packages/opencode/src/modules/ports/tool/tool.module.ts:60–81`) |
| `src/apps/doctor/tests/run-doctor.test.ts` | install / repair / `--check` / retired-skill warning | doctor |
| `src/apps/doctor/tests/embedded-payload.test.ts` | embed equals `skills/`; fallback works without `skills/` | payload |
| `src/apps/doctor/tests/skill-drift.test.ts` | skill prose names this package's verbs and flags | drift |

Package-wide `test` runs all of them; no test in this package needs the network
(hermetic clone fixtures only, B002 §12).

### 6. Scoped single-artifact invocation — DECIDED

Every verb has a one-artifact local form. All are run **from the repo root** and
carry `--dir $PWD`, because `bun run --cwd packages/references` moves the
process cwd into the package, so an omitted `--dir` resolves the store under
`packages/references/` and fails (A002 §10: `mf-specs check --name <name>`
without `--dir $PWD` resolves the default store under `packages/specs` and
fails).

| Verb | Canonical local invocation |
|---|---|
| `doctor` | `bun run --cwd packages/references cli doctor --dir $PWD` |
| `doctor --check` | `bun run --cwd packages/references cli doctor --check --dir $PWD` |
| `list` | `bun run --cwd packages/references cli list --dir $PWD` (`--status missing` to see the sync worklist) |
| `show` | `bun run --cwd packages/references cli show <slug> --dir $PWD` |
| `verify` | `bun run --cwd packages/references cli verify <slug> --dir $PWD` |
| `verify --clones` | `bun run --cwd packages/references cli verify <slug> --clones --dir $PWD` |
| `add` | `bun run --cwd packages/references cli add <url> --name <slug> --purpose "<one sentence>" --dir $PWD` |
| `update` | `bun run --cwd packages/references cli update <slug> --dir $PWD` |
| `sync` | `bun run --cwd packages/references cli sync <slug> --dir $PWD` |
| `status` | `bun run --cwd packages/references cli status <slug> --dir $PWD` |
| `remove` | `bun run --cwd packages/references cli remove <slug> --dir $PWD` |

- **Only these are local.** Whole-store forms are `verify --all`, `update --all`,
  `sync --all`, and the root script `mf:check:references` =
  `verify --all --dir $PWD && doctor --check --dir $PWD`. Per SPEC:70–71 and
  the phase-E rule, no documented local example runs `mf:check:references`,
  `mf:check`, or a bare whole-store verb for one artifact; whole-store forms are
  reserved for CI, the final gate, and explicit request.
- **`doctor` is workspace-scoped on purpose.** It has no single-artifact form:
  its findings are workspace-level (clone root, `.gitkeep`, ignore rule,
  installed skills), and per-entry truth is `verify <slug>` /
  `status <slug>`. E003 documents `doctor --dir $PWD` as the scoped-but-
  workspace-wide command, not as a per-entry check.
- **Where it is documented** (E003 writes, D001 mirrors in the skills):
  1. `packages/references/README.md` — CLI section, one row per verb using the
     table above verbatim.
  2. `packages/references/src/apps/cli/CONTEXT.md` — the folder contract
     (`prompts`/`skills`/`specs` have one; `reviews` does not — A002 §10).
  3. `.agents/documentation/author-mf-utility-cli.md:15–21` — add the
     `references` row to the surface table.
  4. Root `AGENTS.md:39–51` — the unconditional scoping rule (SPEC:69, E002).
  5. Both packaged skills use the scoped form in their pipelines (§11).
- Flag ownership recap so no caller improvises: address by **positional name**,
  never `--name`; always `--dir $PWD`; `--name` is an `add`-only create flag.

### 7. `doctor` scope — DECIDED

`doctor` runs **eight** checks over the workspace root, in this fixed order, and
its JSON-free result is one `DoctorResult` with `status: ok|repaired|drifted`,
`healthy`, and one line per check. (The record previously said "six" over a
seven-row table — corrected in review round 001, F16; `store-root` is the eighth
added by F12, so the count and the table now agree.)

| Check | Default (repair) | `--check` (report only) | Never does |
|---|---|---|---|
| `store-root` | creates `<root>/.agents/@montflow/references/` when absent | reports `missing` | write, move, or delete an entry |
| `registry` | runs the CI-safe `verify` engine (no clones); reports `issues=<n>` | same, no write | edit an entry, write the store, touch a clone |
| `clone-root` | `mkdir -p <root>/.agents/references` | reports `missing` | delete or move the directory |
| `gitkeep` | recreates a 0-byte `.gitkeep` when absent **and**, in a git work tree, stages it with `git add -f .agents/references/.gitkeep` (the ignore rule matches it, so a plain `git add` is refused) | reports `missing` | add a `.gitignore` negation; stage anything under `--check` |
| `gitignore` | applies the one ignore predicate (trim, strip one leading `/`, strip trailing `/`, compare to `.agents/references`) and appends one `.agents/references` line only when no line matches; leading newline when the file lacks one | reports `missing` | reorder, rewrite, or remove any other line; append a duplicate for `/.agents/references`; add a negation |
| `skills-installed` | installs both packaged skills from `packages/references/skills/`, falling back to the embedded payload | reports `missing` | touch a skill this package does not ship |
| `skills-current` | rewrites stale or payload-missing files | reports `stale` / `mismatched` | delete an extra file inside an installed skill dir — extras are reported (`extra file(s): …`) and keep the check healthy |
| `retired-skills` | **warning only** when `.agents/skills/adding-references` or `finding-references` exists, naming both and the removal command | same warning | delete a user skill (retirement is C007's commit) |

- **Store root is doctor's (F12).** B001 says `doctor` owns creating/repairing
  the store root; this table now implements it. `verify` errors with
  `store-root-missing` when the directory is absent and is clean with 0 entries
  when it exists but is empty — so a bad merge that drops the directory fails the
  gate while a legitimately emptied store does not. `list` follows the same rule
  (§4).
- The `.gitkeep`/ignore pair is exactly SPEC:54's scaffolding, and `add` does the
  same three writes before cloning (B002 §3.4) — one helper, two callers, one
  ignore predicate, and no `.gitignore` negation anywhere (F8). `.gitkeep` stays
  tracked; a repair recreates and stages it, `--check` only reports.
- **`doctor` never touches the network, and invokes git for exactly one thing:
  staging a recreated `.gitkeep`** (`GitPort.addForce`, B002 §12 — the doctor
  engine does not spawn git itself, F20; `git add -f`, repair mode only, and only
  when `<root>` is a git work tree). It never runs a clone-graph query (no
  `rev-parse`, `status`, `fetch`, `log`): clone truth is `status`/`verify
  --clones` (B002 §7, `doctor` row). This keeps `doctor --check` runnable in a
  tarball checkout (where it skips the staging step) and in CI with zero clones,
  which is the state this worktree is in today. **Every git-touching report or
  repair `doctor` makes — the staging call — is therefore inside a work tree**;
  its other checks are pure file writes that spawn no git and run in a tarball
  too (B002 §3.4 states the same scope split for `add` vs `doctor`, F30).
- **What counts as healthy:** a check that had to repair still leaves
  `healthy: true` and `status: 'repaired'` (precedent
  `doctor.apps.module.ts:270–282`); `--check` with the same drift is unhealthy
  and exits 1, which is what `mf:check:references` relies on.
- **Retired-skill warning never fails the run.** A fork that still has the old
  skills must not fail CI because of a directory this tool refuses to delete;
  C007 deletes them in this repo, and D001 records the migration.
- `doctor` **does not** own store content (entries are authored, not generated —
  B001 §11.3) and **does not** re-clone, prune, or repair a clone; it owns the
  store **root**, the clone root, and the scaffolding, and repairs nothing else.

### 8. Server entry — DECIDED

`src/server.ts`:

| Element | Decision | Precedent |
|---|---|---|
| plugin id | `export const ID = 'references'` | `packages/reviews/src/server.ts:11`, `packages/skills/src/server.ts:11` |
| command name | `COMMAND_NAME = Cli.COMMAND_NAME = 'mf-references'` → invoked as `/mf-references` | `packages/reviews/src/apps/cli/slash.apps.module.ts:18`, `server.ts:14` |
| command description | one sentence naming the domain and the verbs, in §1 order (same string the binary's `USAGE` header carries) | `slash.apps.module.ts:21–22` |
| layers | `NodeLive = Layer.merge(NodeFileSystem.layer, NodePath.layer)`; `Live` = `ReferenceStore.Default` + `Git.Default` provided with `NodeLive` | `server.ts:20–33` |
| command execution | `ports.command.register({ name, description, execute: (invocation) => Cli.run(invocation.prompt.text, { notify }, ports.cwd).pipe(Effect.provide(Live), Effect.catch((m) => notify(m))) })` | `server.ts:74–82` |
| notify | `Effect.logInfo(message).pipe(Effect.runSync)` | `server.ts:36–38` |
| ports used | `command`, `tool`, `cwd` only — **no `session`, no `agent`, no `model`** | `packages/opencode/src/modules/ports/ports.module.ts:66–80` |

Tools, both built with `defineTool` (`packages/opencode/src/modules/ports/tool/tool.module.ts:60–81`):

**`reference_add`** — register and clone one git URL.

```ts
input: Schema.Struct({
  url: Schema.String,                      // https only; ssh/scp/file/local refused before cloning (B001 §2, B002 §2.1)
  name: Schema.optional(Schema.String),    // slug override; default = derived from url
  ref: Schema.optional(Schema.String),     // branch | tag | commit pin (B001 §3)
  purpose: Schema.optional(Schema.String), // required only for a new url
})
```

Return strings (single string, agent-compact, no glyphs). Each starts with the
same literal the CLI prints (B002 §11), so a model parsing either surface sees
the same token:

- created — `created effect https://github.com/Effect-TS/effect-smol; registered .agents/@montflow/references/effect/REFERENCE.md.`
- routed — `routed add -> update opencode: https://github.com/sst/opencode.git is already registered as opencode; present opencode.`
- refusal/failure — the engine's string verbatim (`refused: --purpose is required to register a reference`, `refused: slug 'effect' is already registered for …`, `failed: clone …`), surfaced as `Tool.Error` by `defineTool` (`tool.module.ts:70–77`).

**A routed line alone is never success (F11).** The tool result is only a
success when the engine returned `kind: 'created'` or `kind: 'routed'` whose
update ended `present`; an update refusal is a `Tool.Error`, so the model cannot
read the notice as a completed add.

`purpose` is optional in the schema on purpose: the route-to-`update` path does
not need one (B002 §3.1 routes at step 3 and only requires a purpose at step 5),
and a required field would force the model to invent a purpose for a reference it
is only refreshing. When the model *does* pass it, a value that fails B001 §2 —
empty, multi-line, over 280 chars, missing the final `.`, or carrying `#`/`": "`
— refuses before any scaffold or clone (B002 §3.1 step 2, F19). Optional means
"omit it on a refresh", not "pass anything".

**`reference_find`** — read-only store lookup, the engine behind the find skill.

```ts
input: Schema.Struct({ query: Schema.String })
```

Match order: exact slug → exact normalized URL (B002 §2.2) → case-insensitive
substring over slug, purpose, and url, sorted by slug, capped at 8 rows with a
`… <n> more` line. Exact hit returns the entry's facts:

```
opencode  installed
url: https://github.com/sst/opencode.git
ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862
purpose: OpenCode v2 host the plugins load into — pinned because ten spec files cite it.
path: .agents/references/opencode
```

and for a missing clone the last line becomes
`path: .agents/references/opencode (missing — run mf-references sync opencode)`.
A non-exact query returns `installed <slug>  <purpose>` rows. No match returns
`No reference matches '<query>'. 14 references registered; run mf-references list to see them.`

**`path` here is the documented exception to B001 §5 (F18).** SPEC:65 requires
the find surface to report where to read the code, so this tool returns the
derived clone path even though no CLI verb prints it in default output. The
engine row already carries the field (`list` returns `{ …, path }`, §5), CLI
renderers emit it only under `--verbose`, and `reference_find` prints it always.
The exception belongs to the tool contract; it must not leak into CLI defaults,
and no future CLI verb inherits it by pointing at this section.

- Composition, not a new engine: exact hit → `show` + the entry decode; otherwise
  `list` filtered by a pure `Reference.matches(entry, query)` predicate in
  `src/modules/reference` (pure, unit-tested, `reviews/src/modules/review` is the
  zero-import precedent — A002 §3). No tenth verb (§1).
- Presence is `fs.stat` only: `installed` / `missing`, never `present`, `dirty`,
  or `ref-mismatch`. A tool must not claim git truth it did not read, and not
  shelling out keeps `reference_find` instant.

**Why deterministic, no session dispatch.** SPEC:63 settles it: both tools are
git and store operations. There is nothing for a model to decide — the URL is
validated, the slug derived or given, the clone a fixed `git clone` argv (B002
§3.2), the entry a fixed template (B001 §2). `reviews`' `review_create` is the
opposite case (it prompts a reviewer session, `server.ts:44–65`) and it is the
one app A002 §8 says **not** to copy. No `ports.session` access anywhere in this
package, and `src/tests/server.test.ts` asserts the fake host recorded zero
dispatches.

### 9. Extra tools — DECIDED: not exposed

`reference_sync`, `reference_status`, `reference_update`, `reference_remove` are
**not** registered.

- The tool surface is the agent's read/author path (`add`, `find`). The other
  four are local maintenance, already reachable by `/mf-references <verb>` and
  by the binary, and each one costs permanent prompt surface plus a schema to
  keep in sync with the engine.
- Two of them are actively bad tool calls: `sync --all`/`update --all` clone or
  fetch 14 repositories inside one tool call, and `remove` is destructive with a
  clone-deleting default. A model should reach those through a slash command or
  a shell call where the user sees the invocation.
- `reference_status` has no stable value to report: the tool return is a string,
  and a 14-row status table is better read from `status --verbose`.

**Rule for adding a tool later** (all five must hold, in one change):

1. the verb already exists in the engine set with engine + renderer tests;
2. it is deterministic, or it is an explicit dispatch tool that declares its
   session port (the `skill_create` shape, `packages/skills/src/server.ts:65–96`);
3. it returns one agent-compact string and fails with a displayable string;
4. `src/tests/server.test.ts` covers it and
   `packages/opencode/test/plugin-loader.test.ts` lists it in the face
   assertion (A002 §5: the loader target list is hardcoded, so a new tool is
   invisible to `turbo smoke` until it is added there);
5. the skill that consumes it and the docs table
   (`.agents/documentation/author-mf-utility-cli.md`) name it in the same change.

### 10. TUI entry — DECIDED: id-only no-op

`src/tui.ts` exports `{ id: ID, setup: () => () => {} } satisfies TuiPlugin`,
matching all five existing plugin packages
(`packages/reviews/src/tui.ts:1–13`, and the identical `setup` no-op in
`profiles`, `prompts`, `skills`, `specs`). `exports['./tui']` must still exist
(`packages/reviews/package.json:24–29`) because the host loads both faces;
mounting nothing is normal.

**Panel deferred, out of scope.** Reasons: (a) no package in this repo mounts a
TUI panel, so a references panel would invent a surface with no precedent to
copy; (b) the whole domain is browse + clone, and both are already one command
away through `/mf-references` and the tools; (c) the TUI suite
(`bun run test:tui`, `apps/workspace`) tests the host, not plugin panels, so a
panel would arrive with no test harness. A future panel is a new task, not a
stub hidden in C001.

### 11. The two skills — DECIDED

| Field | `montflow-add-reference` | `montflow-find-reference` |
|---|---|---|
| `name` | `montflow-add-reference` | `montflow-find-reference` |
| `groups` | `references`, `git` | `references`, `workflow` |
| `dependencies` | `executing-skills` | `executing-skills` |
| `version` | `1.0.0` (new) | `1.0.0` (new) |
| `id` | 16 lowercase hex, generated once by C006 and frozen | same |
| files | `SKILL.md`, `CHANGELOG.md` | `SKILL.md`, `CHANGELOG.md` |
| source of truth | `packages/references/skills/<name>/` | same |

- Groups come from the existing taxonomy (`authoring-skills/SKILL.md:194–208`):
  `git` = git operations, `references` = reference code management, `workflow` =
  process. `add` is a git operation → `references` + `git`; `find` is lookup and
  report → `references` + `workflow`. Both keep `references` so discovery by
  topic works after the generic pair is retired.
- `dependencies: [executing-skills]` on both, exactly as the retired pair had it
  (`adding-references/SKILL.md:8–9`, `finding-references/SKILL.md:8–9`): the
  `> **Prerequisite**: Load the [executing-skills](...)` line is part of the
  skill standard (A002 §6: every shipped skill carries it) and
  `Skill.verifyStandardSkillFile` checks the body shape
  (`packages/skills/src/modules/skill/skill.module.ts:309–364`).
- No `GATES.md`: only the review pair ships one (`packages/reviews/skills/*`),
  and these skills gate nothing.

**Find pipeline** (exact calls; every one carries `--dir $PWD`):

1. **Ensure the skill is installed** — `bun run --cwd packages/references cli doctor --dir $PWD`
   (or `/mf-references doctor`); idempotent, installs both skills.
2. **List what exists** — `bun run --cwd packages/references cli list --dir $PWD`;
   read `installed` / `missing` and the purpose column.
3. **Open one entry** — `bun run --cwd packages/references cli show <slug> --dir $PWD`
   for url, ref, and notes; the clone is `<root>/.agents/references/<slug>`.
4. **Offer to materialize a missing clone** — only with the user's agreement:
   `bun run --cwd packages/references cli sync <slug> --dir $PWD`. Never
   `--all` (14 network clones).
5. **Report** path, purpose, url, ref, then read files under the clone path.
   Never claim git state — `status <slug>` is the verb that reports it.

**Add pipeline** (exact calls):

1. **Resolve the slug** — `--name <slug>` if the user named it, else let `add`
   derive it from the URL (B002 §2.3). Validate against
   `^[a-z0-9]+(-[a-z0-9]+)*$`.
2. **Register** —
   `bun run --cwd packages/references cli add <url> --purpose "<one sentence>" [--name <slug>] [--ref <branch|tag|commit>] --dir $PWD`.
   `add` scaffolds `.agents/references/`, `.gitkeep`, and the ignore line itself;
   the skill never runs `mkdir`, `touch`, `git clone`, or edits `.gitignore`.
3. **Read the result** — `add` prints **exactly one** success line,
   `created <slug> <url>`, and exits 0.
   - `routed add -> update <slug>: …` is a **notice, not a success** (F11). It
     means the URL is already registered and `add` ran `update`; success requires
     the following `present` / `created` / `updated` line **and** exit 0. Any
     following `refused:` / `failed:` line or exit 1 is a failure and must be
     surfaced to the user; the skill must never retry `add`.
   - `<url>` must be the https remote. If the user only has an ssh remote, ask
     for the https URL — ssh/scp/`file`/local paths are refused before cloning
     (B002 §2.1), and the skill must not try to work around that.
4. **Verify the entry exists** —
   `bun run --cwd packages/references cli show <slug> --dir $PWD`.
5. **Never hand-edit the registry** — no markdown table, no `REFERENCE.md` edit
   except notes the user explicitly dictates (SPEC:65).

**Migration note for the retired generic names.** `doctor` reports
`.agents/skills/adding-references` and `.agents/skills/finding-references` as a
warning with
`git rm -r .agents/skills/adding-references .agents/skills/finding-references`;
it never deletes them itself. C007 deletes both directories wholesale
(including their `GATES.md`, per A099) in the same change that lands the store,
and the replacement is recorded as a `1.0.0` changelog entry in both new skills
plus the root changelog: *the registry table in `finding-references/SKILL.md` is
gone; `.agents/@montflow/references/<slug>/REFERENCE.md` is the registry; clones
stay at `.agents/references/<slug>`; `/mf-references` and `mf-references` own
the lifecycle.* D001 updates every skill/doc that links to the old names, and
D002 fixes the taxonomy example column (`authoring-skills/SKILL.md:200,206–207`)
to name the new pair.

### 12. Dependency on `@montflow/skills` — DECIDED: yes, lazily, for skill verification

`packages/references/package.json` gains `"@montflow/skills": "workspace:*"` as a
runtime dependency, used only by the doctor/verify path, imported lazily.

- **What it buys:** `Skill.verifyStandardSkillFile(dirName, markdown)` and
  `Skill.verifySkillFile` (`packages/skills/src/modules/skill/skill.module.ts:309–383`)
  — the one definition of "a valid montflow skill" (required frontmatter, slug
  equality, `# When To Use` / `# Pipeline` / `# Reference`). `doctor` uses it on
  the *installed* copies; `verify` uses it on the *packaged* files (§13.3).
  `SkillStore.skillsDir`/`names` also resolve the installed set without a
  second directory convention.
- **Why not a local shape check:** the parser was worth copying (60 pure lines,
  no owner — A002 §8), but the skill *standard* has an owner. A local copy would
  be a second standard that drifts exactly like the payload `SKILL_NAMES`
  duplication already does (`packages/reviews/scripts/generate-embedded-skills.ts:28–32`
  vs `doctor.apps.module.ts:17–20`), and the failure mode is silent: a skill
  that passes here and fails `mf:check:skills`.
- **Coupling cost, priced:** one workspace dep; bundled by the packer and
  stripped from published `dependencies` (`tooling/pack/src/modules/pack/pack.module.ts:63–66,133–158`,
  A002 §5), so no `workspace:*` leak; no cycle (`packages/skills/package.json:41–44`
  depends only on `@effect/platform-node` + `@montflow/opencode`); lazy import
  keeps the CLI's cold path clean, using the exact seam in
  `packages/profiles/src/modules/skill-check/skill-check.module.ts:1–45`
  (cached `import()`, cache reset on failure).
- **Boundary:** never imported by the store, the git lifecycle, or
  `add`/`update`/`sync`/`status`/`remove` engines. A load failure is a **failed
  `skills-current` check**, not a skipped warning — the package declares the dep,
  so a missing runtime is a packaging bug, unlike `profiles`, which degrades to
  `SKILLS_ENGINE_WARNING` because there the dependency is optional
  (`packages/profiles/src/modules/skill-check/skill-check.module.ts:23,50–51`).
  `doctor` still has the embedded-payload fallback for the *files*; only the
  *verifier* is required.

### 13. Cross-decisions: inherited constraints and conflicts resolved

1. **B001 must be consumed verbatim:** entry path and clone path derived
   (B001 §1, §5), five fields with optional `ref` (§2), issue classes (§7),
   duplicate key = normalized URL (§6), zero-clone `verify` (§11). No schema
   element is redefined here; `--ref`'s *spelling* is the only new thing
   (B001 OQ5 closed: `--ref <branch|tag|commit>`, `--purpose <text>` required,
   `--name <slug>` for the slug).
2. **B002 must be consumed verbatim:** the command sequences, messages, dirty
   rules, ownership proof, status vocabulary, output literals, and matrix are the
   contract. One amendment only: `remove` gets its rule below (B002 OQ2). The
   `sync` force flag is no longer an amendment — B002 §6.2/§10 were corrected in
   review round 001 (F7) to match this surface, so §2.5 and B002 now agree.
3. **`verify` vs `doctor` — the single normative split (F6).**
   - `verify` (plain, CI-safe) reads **committed bytes only**: the store entries
     under `<root>/.agents/@montflow/references/*/REFERENCE.md` plus the
     committed packaged skills under `packages/references/skills/<name>/*`. No
     installed skill, no git, no network, no clone. It errors
     `store-root-missing` when the store **directory** is absent and is clean
     with 0 entries when the directory exists but is empty.
   - `verify --clones` adds local clone truth only (B002 §8.3 comparison, B001 §7
     clone classes), still no network.
   - `doctor` owns everything else in the workspace: the store root, the clone
     root, `.gitkeep`, the ignore line, installed-skill presence and
     byte-freshness in `<root>/.agents/skills/`, and the retired-name warning
     (§7). It never checks entry validity beyond delegating to the CI-safe
     `verify` engine, and `--check` writes nothing.
   - `mf:check:references` runs both (`verify --all` + `doctor --check`), so
     nothing is checked twice and nothing is skipped. B001 §11.3 states the same
     split; if the two ever disagree, this section wins for the surface and
     B001 §11.3 must be corrected in the same change.
4. **`remove` semantics — DECIDED** (was unowned, B002 OQ2):
   `remove <name>` deletes `.agents/@montflow/references/<slug>/` (entry
   directory) and, unless `--keep-clone`, the clone at the derived path **only
   when it is a proven clone** (B002 §2.4 ownership: real work tree, `origin`
   normalizes to the entry URL). Then it removes the now-empty entry directory.
   - dirty clone, no `--keep-clone` → `refused: <slug> clone is dirty (<n> changed paths); rerun with --keep-clone to unregister and keep it`, exit 1, nothing removed;
   - foreign / not-a-repo / mismatched origin, no `--keep-clone` → `refused: <slug> at .agents/references/<slug> is not a clone of <url>; rerun with --keep-clone to unregister and keep it`, exit 1, nothing removed;
   - with `--keep-clone`: entry removed, clone untouched, `removed <slug> clone=kept`, exit 0;
   - never removes the clone root, `.gitkeep`, `.gitignore`, or any other entry; no network; no `--force`.
5. **Invocation threading:** every refusal names the caller's form —
   `mf-references …` (binary, and inside tool strings) vs `/mf-references …`
   (slash) — `author-mf-utility-cli.md:71`, B002 §7.2.
6. **`status` and `verify --clones` share one comparison function** (B002 §8.3);
   the split is presentation and exit code only (§4) — plus `status --fetch`'s
   optional remote-tag predicate (B002 §8.3/§9.2), which no other verb performs
   and which never makes `verify --clones` read a remote (SPEC:60).

### 14. What each downstream task must do with this

- **C004:** implement §1–§6 exactly; `RenderOptions`; the slash `known` sets equal
  to §2; `exitFailed` inside handlers; `USAGE` in §1 order; `src/apps/cli/CONTEXT.md`.
- **C005:** §8–§9; no `ports.session`; both tools agent-compact; server test
  asserts zero dispatches.
- **C006:** §7, §11's skill layout, §12's lazy verifier import, the three doctor
  tests, the retired-name warning, and `SKILL_NAMES` in **both** the generator
  and the doctor (A002 §6).
- **C007:** `mf:check:references` = `verify --all --dir $PWD && doctor --check --dir $PWD`;
  the CI matrix cell (`verify.yml:151–160` pattern); delete the two generic
  skill directories; commit the store.
- **D001:** both skills use §11's pipelines verbatim (scoped forms, no
  `mf:check:*`, no hand-edited registry), plus the migration note.
- **D002/E003:** §6's table into `README.md`, `src/apps/cli/CONTEXT.md`, the
  surface table (`.agents/documentation/author-mf-utility-cli.md:15–21`), the
  `authoring-skills` groups examples, and the root `AGENTS.md` rule.
  **Explicit divergence obligation (F14, do NOT do it in phase B):**
  `.agents/documentation/author-mf-utility-cli.md:57` documents the shared
  `--status valid|invalid` vocabulary for file stores, while this package's
  `list --status installed|missing` is the vocabulary SPEC/TASK demand (clone
  presence is not entry validity; `status` owns entry/clone truth, §2.2). D002
  and E003 must update that document in the same change: add the
  `installed|missing` values for `mf-references`, state why they differ from
  `valid|invalid`, and remove the implication that one flag vocabulary fits every
  store. A surface-table row alone does not satisfy this.
- **B099:** judge that every TASK:24–35 bullet is a ruling, not a menu; that
  §2 is a closed flag table; that §5 names a test per verb; and that the
  recorded B002 interaction — `remove` decided here (§13.4), the `sync` force
  flag already dropped there (F7) — is explicit rather than silent.

## Open Questions

1. **`add` tool blocking time.** `reference_add` performs a full `git clone`
   inside one tool call (B002 §3.2 forbids `--depth`). A large repository can
   hold the call for a minute or more. This record keeps SPEC:63's decision
   (deterministic, no dispatch); if the reviewer prefers a "register first,
   clone on `sync`" tool split, that is a SPEC change to `add`'s ordering, not a
   C005 tweak.
2. **`list` purpose column width.** Agent rows carry the full purpose sentence
   (~80–120 chars), so 14 rows are ~1.5 KB. It is the only column that lets an
   agent choose without a second call, which is why it is in the default. If the
   reviewer values tokens over round-trips, move purpose behind `--verbose` and
   let `reference_find` be the choice surface — one renderer change in C004.
3. **`--human` has no precedent** (A002 §9.1: zero implementations in the repo).
   The §3 contract (four independent combinations, tables, no implication) is
   new surface; C004's `renderers.test.ts` is the only thing holding it.
4. **`.gitkeep` tracking — CLOSED (F8).** The file is already tracked
   (`git ls-files .agents/references` → `.agents/references/.gitkeep`), so it
   stays tracked and no `.gitignore` negation is added anywhere. Doctor repair
   recreates it when absent and **stages it with `git add -f`** when `<root>` is a
   git work tree (the ignore rule also matches the file, so a plain `git add` is
   refused); `--check` only reports. The ignore predicate is one function (trim,
   strip one leading `/`, strip trailing `/`, compare to `.agents/references`)
   shared by `add` and `doctor`, so `/.agents/references` is never duplicated.
5. **`remove` and the store root.** `remove` deletes the entry directory but
   never `.agents/@montflow/references/` itself; an existing empty store is legal
   and verifies clean (`verify` errors only when the **directory** is absent,
   F12). If a reviewer wants `remove` to prune an empty store root, that is a
   one-line addition that would then trip `store-root-missing`, recorded here as
   deliberately not done.
6. **Skill `id`s.** C006 must generate two 16-hex ids once and never regenerate
   them (they are cross-referenced and the standard requires lowercase hex —
   `packages/skills/src/modules/skill/skill.module.ts:279`). No ids are invented
   here.

## Handoff

- **C004 (CLI + slash):** §1–§6 are the whole surface. Copy the `reviews`
  layering, extend `Verbosity` to `RenderOptions`, make the slash parser's known
  flags equal the binary's per verb, and keep every refusal on one stdout stream
  with the caller's invocation form.
- **C005 (tools):** §8–§9. Two tools, no session port, `purpose` optional in the
  schema, presence-only state in `reference_find`, zero dispatches asserted.
- **C006 (skills + doctor):** §7, §11, §12. **Eight** checks in fixed order
  (`store-root`, `registry`, `clone-root`, `gitkeep`, `gitignore`,
  `skills-installed`, `skills-current`, `retired-skills`), network-free doctor
  whose only git call is `git add -f` for a recreated `.gitkeep`, extras never
  deleted, retired-name warning only, lazy `@montflow/skills` verifier,
  `SKILL_NAMES` in both places. The add skill treats a routed line as a notice
  (§11, F11).
- **C007 (migration + gate):** §6's gate line, the CI matrix cell, the store
  commit (including the `opencode` `ref` = full commit, tag in notes), and the
  wholesale deletion of the two generic skill directories.
- **D001/D002/E003 (alignment + scoping):** §6's table verbatim into README,
  CLI `CONTEXT.md`, the CLI standard's surface table, the taxonomy examples, and
  the root `AGENTS.md` rule; §11's pipelines in both skills; retire the generic
  names with the §11 migration note. **D002/E003 also own the `--status`
  vocabulary divergence remedy described in §14 (F14) — it is not done in phase
  B.**
- **B099 (phase review):** judge ruling-over-menu coverage of TASK:24–35, the
  closed flag table, the per-verb test list, and the recorded B002 interaction
  (`remove` here, `sync` force already dropped there).
- **Mechanical check:** `bun run --cwd packages/specs cli check --dir "$PWD"`
  was run from the repo root after writing this file; output is in Deviations.

## Deviations

- **Only this `MEMORY.md` was written.** No `SPEC.md`, `TASK.md`, product code,
  skill, doc, gate, lock, or other task directory touched. The prior 21-line
  placeholder was replaced in place.
- **No `BOARD.md` broadcast and no `MAILBOX.md` note.** Neither file exists for
  this spec (`ls` of the spec root shows `SPEC.md` plus task directories only),
  and PROFILE/TASK restrict writes to this file. The Handoff section is the
  broadcast.
- **No `GATES.md` and no mechanical gate for the task itself.** SPEC:85 lists
  B003 as `Gates: No`; the only command run is the spec-structure check named in
  the receipt.
- **The `sync` force flag is dropped — B002 now agrees.** B002 §6.2/§10 assumed
  one; TASK:25 and SPEC:57 do not allow it. This record dropped it (§2.5) and
  review round 001 (F7) amended B002 itself, so the two records now state the same
  surface; no amendment note is needed at implementation time.
- **`remove` is decided here, not in B002.** B002 OQ2 explicitly left it
  unowned; §13.4 fills it, including the refusal rules B002 only sketched.
- **No network, no clone, no git write.** Every repo claim is a path + line
  citation against the current tree, or a non-mutating read (`git ls-files`,
  `git check-ignore`).
- **Spec check output, verbatim** (run after writing this file):

  ```
  $ bun run src/apps/cli/main.ts check --dir /home/daniel/dev/montflow/reference-plugin
  6 specs · 0 failed · 0 issues
  ```

  Exit code `0`.
