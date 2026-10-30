# Memory

## Context

- Task: **B001 — decide-registry-store-contract** (planning), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin` (HEAD `a94972e`).
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Spec read: `.agents/@montflow/specs/montflow-references-plugin/SPEC.md`
  (1–101); requirements 51–73 are authoritative, and SPEC:52–53 already fixes
  the entry path, the five frontmatter fields, and the derived clone path — this
  task only fills in what SPEC left open.
- Phase A evidence consumed: A001 §1–§5 (surface + 14-row inventory),
  A002 §3/§8/§9 (package anatomy, store-as-service, frontmatter parser copy),
  A003 §1d/§2/§3/§3a/§5 (consumers, pin, migration map, URL-keyed dedupe,
  CI-safe boundary).
- Live registry read at `.agents/skills/finding-references/SKILL.md:56–71`
  (14 rows, columns `Reference | Path | URL`); ignore rule read at
  `.gitignore:254–257`.
- This is a **decision** task: everything in Findings is a ruling C002–C007 can
  implement without renegotiating. Rejected alternatives are recorded only
  where the rejection is part of the ruling.
- Only file written: this `MEMORY.md`. No spec state, product code, skill, doc,
  gate, or other task directory was touched.
- Work-order sources that still do not exist: no `PHASE.md`, `BOARD.md`, or
  per-task `MAILBOX.md` in the spec directory (same gap A001:14–17 and
  A003:24–26 recorded); see Deviations.

## Progress

Done, in order:

1. Read `PROFILE.md`, `SPEC.md` (all 101 lines), `TASK.md`, and the three phase-A
   memories; read the placeholder `MEMORY.md` (21 lines).
2. Read the live registry (`.agents/skills/finding-references/SKILL.md:52–73`)
   and the ignore block (`.gitignore:254–258`) directly rather than trusting the
   summaries.
3. Recovered the repo's slug authority: `SLUG_PATTERN` is the identical literal
   `/^[a-z0-9]+(?:-[a-z0-9]+)*$/` in **six packages, seven modules**:
   `packages/skills/src/modules/skill/skill.module.ts:18`,
   `packages/specs/src/modules/spec/spec.module.ts:9`,
   `packages/specs/src/modules/task/task.module.ts:9`,
   `packages/profiles/src/modules/pi-profiles/pi-profiles.module.ts:43`,
   `packages/prompts/src/modules/prompts/prompts.module.ts:189`,
   `packages/reviews/src/modules/review/review.module.ts:25`,
   `packages/workflows/src/modules/workflow/workflow.module.ts:64` — plus two
   directory-safe copies in
   `apps/workspace/src/services/profiles/profiles.services.module.ts:193`
   (`PROFILE_SLUG_PATTERN`) and
   `apps/workspace/src/services/prompts/prompts.services.module.ts:196`
   (`PROMPT_SLUG_PATTERN`).
4. Read the shared frontmatter parser
   (`packages/specs/src/modules/frontmatter/frontmatter.module.ts:1–96`),
   including its empty-value → `[]` behaviour (`:43–51`) and
   `fieldString`'s array → `undefined` behaviour (`:69–76`).
5. Read the shared issue contract
   (`packages/specs/src/modules/verify/verify.module.ts:5,8,57`) and the two
   store verifiers that consume it
   (`packages/skills/src/modules/skill/skill.module.ts:284–364`,
   `packages/profiles/src/modules/pi-profiles/pi-profiles.module.ts:111–135,206–227`),
   plus the rendered issue line format
   (`packages/reviews/src/modules/review/review.module.ts:1125–1138`).
6. Read the store-scan precedent
   (`packages/reviews/src/services/review-store/review-store.services.module.ts:25–53`),
   the date contract (`packages/specs/src/modules/spec/spec.module.ts:15,205–210`),
   and the store-root template precedent (`.agents/@montflow/profiles/TEMPLATE.md:1–10`).
7. Proved the two path facts the contract depends on:
   `.agents/@montflow/references/<slug>/REFERENCE.md` is **not** ignored
   (`git check-ignore -v --no-index .agents/@montflow/references/effect/REFERENCE.md`
   → no output, exit 1) and the clone root **is**
   (`git check-ignore -v --no-index .agents/references/opencode` →
   `.gitignore:257:.agents/references`, A001:222–224);
   `git ls-files .agents/references` → `.agents/references/.gitkeep` only.
8. Decided every open point, wrote this file, and ran the spec check
   (output verbatim in Deviations).

## Findings

### 1. Entry path and name rule — DECIDED

- One entry is one directory: `<root>/.agents/@montflow/references/<slug>/REFERENCE.md`.
  `REFERENCE.md` is the only accepted entry filename; case matters.
- `slug` is simultaneously (a) the directory name, (b) the frontmatter `name`,
  and (c) the clone directory name under `<root>/.agents/references/`. No fourth
  identity exists.
- Slug grammar: reuse the repo-wide `SLUG_PATTERN`,
  `/^[a-z0-9]+(?:-[a-z0-9]+)*$/`
  (`packages/specs/src/modules/spec/spec.module.ts:9`,
  `packages/skills/src/modules/skill/skill.module.ts:18`). No local variant, no
  extra characters, no underscores, no uppercase. Length 1–64 chars, matching
  the skill `name` limit (`packages/skills/src/modules/skill/skill.module.ts:320`).
- A slug is **not** required to equal the upstream repo basename: `effect`
  (upstream `effect-smol`) and `sveltekit` (upstream `kit`) are legal and stay
  (registry rows `finding-references/SKILL.md:60,63`; A003:242–243). Slug
  derivation from a URL is an `add`-time convenience, never a store invariant.
- Store scanning is directory-driven and exactly one level deep: immediate
  subdirectories only, dot-prefixed entries skipped, sorted
  (precedent: `packages/reviews/src/services/review-store/review-store.services.module.ts:29–53`).
  Consequence: a clone that happens to contain its own `REFERENCE.md` can never
  be mistaken for an entry — clones live in a different tree entirely
  (`.agents/references/`, `.gitignore:257` vs store `.agents/@montflow/references/`).
- Non-directory files at the store root are ignored by the scan, so a future
  `TEMPLATE.md` is allowed (precedent `.agents/@montflow/profiles/TEMPLATE.md:1–10`);
  the migration adds none, because a template is shipped prose in
  `packages/references/skills/`, not registry state.
- Inventory is the union of (a) files that exist and parse, (b) directories that
  lack `REFERENCE.md` (reported by `entry`), and (c) duplicates (Findings §6).

### 2. Frontmatter contract — DECIDED

Canonical key order (authors write it this way; **not** mechanically verified —
ordering is diff hygiene, not correctness):

```yaml
name: <slug>
url: <https git url>
purpose: <one sentence>
added: <YYYY-MM-DD>
ref: <branch|tag|commit>   # optional; omit for a default-branch entry
```

| Field | Type | Required | Rule | Precedent |
|---|---|---|---|---|
| `name` | string scalar | yes | `SLUG_PATTERN`, 1–64 chars, byte-equal to the directory name | `packages/skills/src/modules/skill/skill.module.ts:316–324` |
| `url` | string scalar | yes | `https://` only; single line; shape rules below | new (no store holds a URL today) |
| `purpose` | string scalar | yes | one sentence, 1–280 chars, ends with `.`, no `#`, no `": "` | one-line `description` precedent `packages/profiles/src/modules/pi-profiles/pi-profiles.module.ts:16–17` |
| `added` | string scalar | yes | ISO date `YYYY-MM-DD`, reuse `ISO_DATE_PATTERN` | `packages/specs/src/modules/spec/spec.module.ts:15,205–210` |
| `ref` | string scalar | no | pinned revision; see Findings §3 | new |

Parser mapping (matters for implementation, grounded in
`packages/specs/src/modules/frontmatter/frontmatter.module.ts:21–76`):

| On-disk shape | Parsed value | Reading |
|---|---|---|
| key absent | `undefined` | optional field absent |
| `key: value` | `'value'` | the value |
| `key:` (empty) | `[]` → `fieldString` → `undefined` | absent, **plus** a `ref-empty` warning for `ref` and a `*-missing` error for the required fields |
| `key:` + indented `- item` lines | `['item', …]` | wrong type for every one of these five fields → shape error |

`url` shape rules (deterministic, CI-safe, no network):

1. Parses under WHATWG `URL`; `protocol === 'https:'`.
2. No `username`, no `password`, no `search`, no `hash`.
3. Path has ≥2 non-empty segments (owner/repo or equivalent); no `.`/`..`
   segment; no whitespace or `\` anywhere; optional single trailing `.git`.
4. Non-https forms (`http://`, scp-style `user@host:path`, ssh URLs, `file://…`,
   local paths) are **refused**, not silently converted. A future transport is a
   new field, not a new URL spelling.
5. The same predicate runs in `add` **before any clone** (B002 §2.1): an ssh,
   scp-style, `file://`, or local-path argument is refused with a
   "use the https URL" message, so a non-https string can never reach the store.
   The verifier rule above stays the backstop for hand-edited entries; this is
   why no entry ever carries a non-https `url`.

`purpose` scalar rule: no `#` and no `": "` substring. Rationale: the repo
parser only treats a line as a comment when it *starts* with `#`
(`frontmatter.module.ts:38`) and takes everything after the first `: ` as the
value (`:39–42`), so `purpose: Foo: bar` round-trips here but breaks under any
real YAML parser; banning the two sequences keeps the store readable by both.
This forces the `:` in some phase-A purpose drafts to become an em dash —
see Findings §8.

`added` records the date a reference was **first registered in this store**, not
the upstream commit date. Validation is format-only: no "not in the future"
check, because that would make `verify` clock-dependent and a fresh CI checkout
must stay deterministic. Typos are cheap to catch in review.

Forbidden keys — error, not warning: `path`, `dir`, `directory`, `clone`,
`clonePath`. They reintroduce exactly the drift SPEC:53 forbids ("The clone path
is derived … and is never stored in the entry"). Any other unknown key is a
**warning** (`field-unknown`), matching the repo's permissive precedent (no
store verifier today inspects unknown keys:
`packages/specs/src/modules/spec/spec.module.ts:166–219`,
`packages/profiles/src/modules/pi-profiles/pi-profiles.module.ts:206–227`).
Residual risk accepted: a typo'd `ref` reads as a default-branch entry and
surfaces as a warning, not a failure. Promoting unknown keys to errors was
rejected: it would freeze the field set and break forward-compatible additions,
and the warning is already visible in default `verify` output for failures.

### 3. `ref` semantics — DECIDED

- `ref` is one optional scalar. Accepted forms: **branch** (`dev`,
  `feat/scopes`), **tag** (`v2.0.18`), **abbreviated commit** (`cd9a14a`,
  7–40 lowercase hex), **full commit**
  (`cd9a14a6b688d4021bee381dfd39d2cef9c0f862`).
- The entry does **not** record which kind a ref is. CI has no clone, so kind
  cannot be determined without network or a clone; a `kind` field would be a
  guess stored as data.
- Shape rule (`REF_PATTERN` plus the rejects below), pure and CI-safe, and the
  **single predicate** shared by CI `verify` and B002's `resolveRef`:
  1. 1–255 chars; characters limited to `[A-Za-z0-9._/-]` — which already
     excludes whitespace, control chars, backslash and the git-reserved
     characters `~ ^ : ? * [`.
  2. Rejects: leading `/`, any `//`, any `@{`, leading `.` or `-`, trailing `/`
     or `.`, any `..`, any component ending `.lock`. (Mirrors
     `git check-ref-format` per component without shelling out; the old rule
     accepted `/main` and `feat//x`, which `git check-ref-format refs/heads//foo`
     rejects — verified exit 1.) B002's resolver prefixes `refs/tags/`,
     `refs/remotes/origin/`, `refs/heads/`, so only a shape git itself accepts
     can be satisfied.
  3. Purely-hex values must be 7–40 lowercase hex — a 4–6 char hex string is
     ambiguous with a branch/tag name and is refused as `ref-shape`.
  4. Everything else is a refname: resolved by git only when a clone exists.
- **Shape classes** — the one classification both records use (B002 §2.6's
  `refShape`, F31): 7–40 lowercase hex = **commit**; a **tag-shaped candidate** —
  `refs/tags/<name>`, or a bare `<name>` — is **tag** when `refs/tags/<name>`
  actually resolves in the clone (a candidate that does not is not guarded);
  `refs/heads/<name>`, `refs/remotes/<name>`, and every other name = **branch**.
  Resolution follows B002 §2.6's one order: commit → tag →
  `refs/remotes/origin/<name>` → `refs/heads/<name>` → a literal `refs/...`
  refname. A bare name that resolves only to a branch is therefore
  branch-shaped and gets no moved-tag guard. The literal `refs/tags/<name>`
  spelling is normalized to `<name>` (`tagName`) before any remote lookup, so
  the tag query is `refs/tags/<name>` / `refs/tags/<name>^{}` — the prefix is
  applied exactly once, to the normalized name, never to the raw value (B002
  §5.2, §12).
- CI `verify` (`ref-shape`) and B002's `resolveRef` (§2.6 there) apply this one
  predicate; neither may add a looser spelling, and C003 must not let the two
  diverge silently.
- **Empty / absent `ref` = default branch.** Canonical spelling is to omit the
  key; the writer never emits `ref:` for a default-branch entry. An explicitly
  empty `ref:` is still *read* as default branch (so a half-written file never
  invents a pin) but emits the advisory `ref-empty` warning telling the author
  to drop the line. A list-shaped `ref` is an error.
- Pin immutability: for an entry with `ref`, `update` must never move the pin;
  moving a pin is a store edit (SPEC:56 pins only say "checks out a recorded
  `ref`"). Resolution must come from the entry, never from the currently
  checked-out state — today's only local `opencode` clone sits on `dev` @
  `23e3493ab2`, not the pin (A003:173–178).
- Resolution order when a name is both a tag and a branch is git's own
  `rev-parse` order (tags before heads). That is a documented acceptance, not a
  contract to re-implement; keep ref names unique in practice.
- The `opencode` pin is recorded as the **full commit**
  `cd9a14a6b688d4021bee381dfd39d2cef9c0f862` — immutable by construction — and
  the tag `v2.0.18` (the exact token the ten `montflow-opencode-migration` spec
  files quote, A003:47–64,159–169) is recorded in the body notes (Findings §9),
  so both the human citation and the machine contract resolve. SPEC:53 allows
  exactly one `ref` field, so `ref` carries the immutable half. Consequences:
  `update` never moves the pin (a moved pin is a store edit), a force-moved
  upstream tag cannot change what the clone checks out (B002 §5.2 fetches tags
  without `--force` and resolves the recorded commit), and `verify --clones`
  compares `HEAD` to the recorded commit. Because the recorded value is a
  **commit**, a retag of `v2.0.18` changes neither `HEAD` nor that comparison —
  it is **ignored**, and no guard runs (F24). The moved-tag **refusal** belongs to
  a **tag-shaped candidate that resolves to a tag** — §3's class: a bare or
  literal `refs/tags/<name>` spelling whose `refs/tags/<name>` resolves (the same
  `refShape` predicate B002 §2.6 applies) — where the
  recorded value *is* the movable tag: only there does a retag produce a
  `ref-mismatch` (or `ref-unresolvable` when the local tag itself is gone) and
  make `update` refuse for a human to
  resolve, never a silent follow (B002 §5.2, §5.6). A bare name that resolves
  only to a branch is branch-shaped and is not guarded. Rejected alternative:
  `ref: v2.0.18`, which
  leaves the pin at the mercy of upstream tag rewriting (B001 OQ2 closed).
- The store accepts `ref` from any writer. Whether `add` grows a `--ref` flag is
  a CLI decision (B003) — SPEC:55 lists no such flag.

### 4. Body contract — DECIDED

- Body = everything after the closing `---`. Exactly one H1, spelled `# Notes`.
  Content beneath it may be empty (the structural marker is mandatory so the
  parser cannot confuse a note with frontmatter and so an author cannot dodge
  the section). `##` subheadings are allowed.
- **Belongs in the body** (slow-changing, human-authored provenance):
  - why a pin exists and which commit the tag resolved to at authoring time;
  - vendoring/provenance statements (the `anti-slop` copy at
    `tooling/oxlint/anti-slop/`, A003:76–101);
  - upstream caveats, licence notes, migration history, which specs cite the
    entry.
- **Never in the body** (derived at read time — if it can change without editing
  the store, it does not belong in the store):
  - clone path (mechanically enforced: the literal `.agents/references/` in the
    body is an error);
  - clone presence/state (`missing|present|dirty|ref-mismatch`), `HEAD`,
    current branch, ahead/behind counts, last-sync timestamps;
  - any restatement of `name`/`url`/`purpose`/`added`/`ref` as a table or block;
  - file or directory listings of the clone.
- Authoring guidance that is *not* mechanically checked (recorded so C002 does
  not over-build): the "no restatement" rule and pin rationale quality stay
  review concerns, exactly like skill style
  (`packages/skills/src/modules/skill/skill.module.ts:298–305`).

### 5. Clone-path derivation — DECIDED

- `clonePath(root, slug) = <root>/.agents/references/<slug>`, where `root` is
  the workspace root passed as `--dir` (default `process.cwd()`), the same
  `StoreScope` idea already used by the CLI
  (`packages/reviews/src/services/review-store/review-store.services.module.ts:25–33`).
  Any directory is a valid `root` for `list`/`show`/`verify`/`status`; `add` is
  the one verb that additionally requires `<root>` to be a git work tree,
  because the store it writes is committed and `.gitkeep` staging needs git
  (B002 §3.1 step 0, F30).
- The path is **never stored**: not in frontmatter keys (forbidden, Findings §2),
  not in the body (`.agents/references/` literal is an error), and not in a
  sidecar file.
- **Default output never carries the derived path** (F18). No verb's
  agent-default success or state line includes it: `add` prints
  `created <slug> <url>`, `update`/`sync` materialization prints
  `created <slug> <url> [@ <ref>]` (B002 §6.3, §11), `status`/`list` keep it out
  entirely, and `path=` is added only by `--verbose` (B003 §3). Two documented
  exceptions, neither of which is a CLI default:
  1. **`reference_find` (tool, SPEC:65)** returns
     `path: .agents/references/<slug>` because the find surface must report where
     the code lives. The tool may call the engine with path enabled; that is a
     tool return contract owned by B003 §8, never a CLI default, and no CLI verb
     — including a future one — inherits the exception.
  2. **Failure and refusal messages** name the path they failed on, e.g.
     `failed: clone <url> -> .agents/references/<slug>: <msg>` (B002 §4.4), and
     `remove` names the clone it declines to delete (B003 §13.4), because the
     reader needs the location of a failure. A success or state line still never
     carries the path.
- One derivation function, used by `add`, `update`, `sync`, `status`,
  `verify --clones`, and `doctor`; entry and filesystem cannot disagree because
  the filesystem side is never an input.
- Store root and clone root are distinct trees: `.agents/@montflow/references/`
  (committed, `git check-ignore` exit 1) vs `.agents/references/`
  (ignored, `.gitignore:257`). Nothing is ever symlinked between them, and no
  verifier may descend from one into the other.

### 6. Duplicate policy — DECIDED

| Duplicate | Severity | Issue class | Key |
|---|---|---|---|
| same slug claimed twice | error | `duplicate-slug` | exact `name` string |
| same upstream repo registered twice | error | `duplicate-url` | normalized URL |

- **Duplicate slug**: two entries resolving to the same slug. With the one-level
  scan and `name == directory` this is structurally impossible today; the check
  exists because the same verifier must hold if the store is ever scanned from
  more than one root (alternate `--dir`, aggregated stores), and because a
  directory whose name is not a slug (e.g. `SvelteKit`) must still be diagnosed
  deterministically (`directory-slug` on `entry`, plus `name-slug` /
  `name-directory` on `name`).
- **Duplicate URL keys on the normalized URL** — `url.trim()`, drop trailing
  `/`, drop one trailing `.git`, lowercase everything. Rationale: 7 of the 14
  rows carry `.git` and 7 do not, one owner is cased `SigNoz`
  (`finding-references/SKILL.md:58–71`; A001:193–197), and the two
  already-registered URL↔slug mismatches (`effect-smol`, `kit`) mean dedupe
  keyed on the derived slug would fork the registry (A003:242–250). Lowercasing
  the whole URL treats GitHub owners/repos as case-insensitive, which they are;
  a case-sensitive self-hosted host that genuinely needs two case-only-different
  repos would collide, and the refusal names both slugs so a human decides —
  the store never silently merges.
- **May one URL be registered twice under different names? No.** One upstream
  repository = one slug = one clone path = one entry. Reasons: (a) the clone
  path is derived from the slug, so two names mean two full clones of the same
  repository on disk; (b) two entries would need a rule for which one `find`
  reports and which one `sync` materializes, i.e. exactly the "two registries
  disagree" failure this spec exists to remove; (c) a second pin of the same
  repo is a *revision* question, not a *repository* question — that is what
  `git -C .agents/references/<slug> show <commit>:<path>` is for. A future
  multi-pin list (`refs:`) would be a contract change, not an `add` flag.
- Stored `url` is byte-for-byte what was registered (migration keeps all 14
  strings exactly as `finding-references/SKILL.md:58–71` has them); normalization
  is only the comparison key. Consequence: `.git` presence is not a
  normalization trigger for the written field, so no row changes spelling in the
  migration.
- Slug collision with a *different* URL is an `add` refusal (SPEC:55,
  "a slug collision with a different URL is refused"), reported by the CLI as a
  collision naming the occupied slug; the store verifier never has to see it
  because `add` writes nothing on refusal. Name matching order in `add`:
  normalized URL first (routes to `update`), then `--name`, then derived
  basename slugified (reuse the `slugify` precedent,
  `packages/profiles/src/modules/pi-profiles/pi-profiles.module.ts:75–80`).

### 7. Validation error classes — DECIDED

Implementation shape is already fixed by the repo:
`Issue { field, message, severity?, fix?, line? }`
(`packages/specs/src/modules/verify/verify.module.ts:5–20,57`) and the rendered
line `N. [field] message` plus `Fix: …`
(`packages/reviews/src/modules/review/review.module.ts:1125–1138`). The classes
below are the complete set — **34 ids**: 27 store-scope classes emitted by plain
`verify` and 7 clone-scope classes emitted only by `verify --clones` — and `field`
is the rendered token, the id is the stable
label for tests and docs (C002 may export the ids as a constant; tests assert
`field` + `message`, following
`packages/skills/src/modules/skill/tests/verify.test.ts:56–60`). Default
severity is `error`; only the three marked `warning` are advisory
(`IssueSeverity`, `packages/profiles/src/modules/pi-profiles/pi-profiles.module.ts:111–119`).

| id | field | sev | message |
|---|---|---|---|
| `frontmatter-missing` | `frontmatter` | error | `Missing frontmatter block.` |
| `name-missing` | `name` | error | `Required frontmatter field is missing or empty.` |
| `name-slug` | `name` | error | `Must be lowercase alphanumeric groups joined by single hyphens.` |
| `name-length` | `name` | error | `Must be 1-64 chars.` |
| `name-directory` | `name` | error | `Must match the directory name '<slug>'.` |
| `directory-slug` | `entry` | error | ``Directory name '<dir>' is not a valid slug.`` |
| `entry-missing` | `entry` | error | ``Directory '<dir>' has no REFERENCE.md.`` |
| `entry-extra-file` | `entry` | warning | ``Unexpected file '<file>' in the entry directory.`` |
| `url-missing` | `url` | error | `Required frontmatter field is missing or empty.` |
| `url-scheme` | `url` | error | `Must be an https:// URL; ssh and scp-style sources are not stored.` |
| `url-shape` | `url` | error | `Must be https://<host>/<owner>/<repo>[.git] with no credentials, query, or fragment.` |
| `purpose-missing` | `purpose` | error | `Required frontmatter field is missing or empty.` |
| `purpose-length` | `purpose` | error | `Must be 1-280 chars.` |
| `purpose-scalar` | `purpose` | error | `Must be one sentence without '#' or ': '.` |
| `purpose-terminal` | `purpose` | error | `Must end with '.'.` |
| `added-missing` | `added` | error | `Required frontmatter field is missing or empty.` |
| `added-format` | `added` | error | `Must be an ISO date (YYYY-MM-DD).` |
| `ref-shape` | `ref` | error | `Must be a branch, tag, or 7-40 char commit id.` |
| `ref-empty` | `ref` | warning | `Drop the empty ref line; omit the key for a default-branch entry.` |
| `field-forbidden` | `<key>` | error | ``The clone path is derived as <root>/.agents/references/<slug>; it is never stored.`` |
| `field-unknown` | `<key>` | warning | `Unknown frontmatter field; allowed keys are name, url, purpose, added, ref.` |
| `duplicate-slug` | `name` | error | ``Duplicate slug; also declared by '<other>'.`` |
| `duplicate-url` | `url` | error | ``Duplicate URL after normalization; already registered as '<slug>'.`` |
| `body-missing` | `body` | error | ``Missing `# Notes` section.`` |
| `body-multiple-h1` | `body` | error | `Must contain exactly one '# Notes' heading.` |
| `body-derived` | `body` | error | `Body restates the derived clone path; clone state is derived at read time.` |
| `store-root-missing` | `store` | error | ``Store root .agents/@montflow/references/ is missing; run '<invocation> doctor'.`` |

Clone-scope classes (emitted only by `verify --clones`, never by plain `verify`;
B002 §10 renders them through the same `[field] message` line):

| id | field | sev | message |
|---|---|---|---|
| `clone-missing` | `path` | error | ``Clone is missing; run '<invocation> sync <slug>'.`` |
| `clone-path` | `path` | error | ``Clone path '<path>' is not a directory (file or symlink).`` |
| `clone-not-git` | `git` | error | `Not a git work tree.` |
| `clone-origin` | `origin` | error | ``Clone origin '<actual>' does not match '<expected>'.`` |
| `clone-dirty` | `dirty` | error | `Clone has <n> changed paths.` |
| `clone-head` | `head` | error | ``Clone HEAD <sha7> does not match ref '<ref>' (<expected sha7>).`` |
| `ref-unresolvable` | `ref` | error | ``Ref '<ref>' does not resolve in the clone.`` |

`clone-missing` and `clone-path` are kept separate on purpose: absent is the
state `sync` fixes, a non-directory path is the state a human fixes. Both carry
field `path`, matching B002 §10's `path`/`head`/`origin`/`dirty`/`git` field
tokens. No other class may be invented for clone state; a new clone failure is a
new row here first.

Attribution rule (SPEC:60 "every issue names the entry and the field"): the
report block names the entry by its store-relative path
(`.agents/@montflow/references/<slug>/REFERENCE.md`, or the bare `<slug>` for
store-level classes such as `entry-missing`/`duplicate-*`), and each line names
the `field`. That mirrors `Review.verifyReport(path, result)` exactly
(`packages/reviews/src/modules/review/review.module.ts:1125–1128`).

Rendered shape — one statement, and B002 §10 / B003 §3 cite it verbatim (F17,
F21). Agent default (the only shape the tools return): one header
`error <path> has <n> issue(s). Fix each one and run verify again.` per failing
entry, then one numbered `N. [field] message` line per error (plus `Fix: …` when
the class carries a fix), then one `warn [field] message` line per warning.
`<path>` is the store-relative path above; `<n>` counts errors plus warnings;
`issue` is singular only when `<n> == 1`. `--human` prefixes the same header and
warning lines with `✗` and `⚠` in place of `error` and `warn` (B003 §3) and
differs in nothing else. No glyph appears in agent default.

An absent store **directory** is an error: `verify` emits `store-root-missing`
(field `store`) when `<root>/.agents/@montflow/references/` itself does not
exist, because the gate must not pass after a bad merge silently dropped the
registry (F12 — the `reviews` "absent store = no series" precedent is
deliberately inverted here). An **existing but empty** store directory is legal
and verifies clean with 0 entries: `remove` may legitimately empty it, and C001
scaffolds it empty. `list` applies the same rule (refuses with the same message
when the directory is absent, reports 0 rows when it is empty — B003 §4).
`doctor` owns creating/repairing the store root, the clone root, and `.gitkeep`
(SPEC:59); `verify` only reports.

### 8. Migration table — all 14 rows — DECIDED

Source: `.agents/skills/finding-references/SKILL.md:58–71` (verbatim order and
URLs). `url` is copied **byte-for-byte** (7 with `.git`, 7 without — do not
normalize at migration). `purpose` is **authored for this migration** — the
source table has no purpose column and no purpose prose exists anywhere in the
repo (A003:203–209): every string below is a **PROPOSAL** accepted here, to be
written verbatim by C007, not "migrated" data. `added` values are the
line-introduction dates from `git blame -L58,71` (A003:228–233), not upstream
dates; they are provenance, so the blame date is the honest value. `ref` is
omitted for all rows except `opencode`.

| # | slug | url (verbatim) | purpose (authored PROPOSAL) | added | ref |
|---|------|----------------|-----------------------------|-------|-----|
| 1 | `alchemy-effect` | `https://github.com/alchemy-run/alchemy-effect.git` | Infrastructure-as-code for Effect — typed cloud resources and deploy-time wiring. | 2026-07-22 | — |
| 2 | `drizzle-orm` | `https://github.com/drizzle-team/drizzle-orm` | TypeScript ORM with a SQL-like query builder and schema migrations. | 2026-07-22 | — |
| 3 | `effect` | `https://github.com/Effect-TS/effect-smol` | Effect v4 source, published upstream as effect-smol — the runtime the whole monorepo targets. | 2026-07-22 | — |
| 4 | `orpc` | `https://github.com/middleapi/orpc.git` | Typesafe RPC/API layer for TypeScript services. | 2026-07-22 | — |
| 5 | `shadcn-svelte` | `https://github.com/huntabyte/shadcn-svelte` | Svelte port of the shadcn/ui component patterns. | 2026-07-22 | — |
| 6 | `sveltekit` | `https://github.com/sveltejs/kit.git` | SvelteKit framework — routing, server-side rendering, and build. | 2026-07-22 | — |
| 7 | `signoz` | `https://github.com/SigNoz/signoz` | Open-source observability platform for metrics, traces, and logs. | 2026-07-22 | — |
| 8 | `workers-oauth-provider` | `https://github.com/cloudflare/workers-oauth-provider` | OAuth provider library for Cloudflare Workers. | 2026-07-22 | — |
| 9 | `effect-cf` | `https://github.com/jbt95/effect-cf` | Effect runtime and integrations for Cloudflare Workers. | 2026-07-22 | — |
| 10 | `vitest` | `https://github.com/vitest-dev/vitest` | Vite-native test runner used across the workspace. | 2026-07-22 | — |
| 11 | `anti-slop` | `https://github.com/dmmulroy/anti-slop.git` | Oxlint rule plugin rejecting low-evidence TypeScript patterns — vendored at tooling/oxlint/anti-slop/. | 2026-09-04 | — |
| 12 | `opentui` | `https://github.com/sst/opentui.git` | SST terminal UI framework behind the TUI surfaces. | 2026-09-13 | — |
| 13 | `opencode` | `https://github.com/sst/opencode.git` | OpenCode v2 host the plugins load into — pinned because ten spec files cite it. | 2026-09-13 | `cd9a14a6b688d4021bee381dfd39d2cef9c0f862` |
| 14 | `pi-subagents` | `https://github.com/nicobailon/pi-subagents.git` | Pi subagent implementation, kept as the historical reference for the retired pi surface. | 2026-09-13 | — |

Notes C007 must honour while writing these (all decided here):

- `opencode/REFERENCE.md` carries
  `ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862` and a body note recording the
  tag `v2.0.18` and the ten citing spec files (A003:47–64). This is the only
  pinned row; the other 13 are default-branch entries with no `ref` key at all.
- `anti-slop/REFERENCE.md` body records the vendoring: copied from
  `dmmulroy/anti-slop` `src/` into `tooling/oxlint/anti-slop/`, MIT
  (A003:76–101), so a future refresh can diff.
- Every other entry gets the same shape with an empty `# Notes` section; no
  filler prose (an empty section is legal by Findings §4).
- Slug set after migration is exactly the 14 names above; none changes, so no
  prose citation of `.agents/references/<slug>/` breaks (A003:263–267).
- The migration deletes the source table
  (`.agents/skills/finding-references/SKILL.md:56–71`) in the same change; the
  store is the only registry afterwards (SPEC:52).

### 9. Complete valid entry — DECIDED example

`.agents/@montflow/references/opencode/REFERENCE.md` (validates clean, zero
issues; exercises the optional `ref`, a note that is allowed to name a commit,
and no derived state):

```markdown
---
name: opencode
url: https://github.com/sst/opencode.git
purpose: OpenCode v2 host the plugins load into — pinned because ten spec files cite it.
added: 2026-09-13
ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862
---

# Notes

Pinned to the commit `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`, which is the
tag `v2.0.18` upstream. The tag is what the ten
`.agents/@montflow/specs/montflow-opencode-migration` files quote; the commit is
the `ref` because it is the immutable half of the pin — a retagged upstream
`v2.0.18` cannot move it.

A default-branch entry looks the same without the `ref` line, e.g.
`effect/REFERENCE.md`:

    ---
    name: effect
    url: https://github.com/Effect-TS/effect-smol
    purpose: Effect v4 source, published upstream as effect-smol — the runtime the whole monorepo targets.
    added: 2026-07-22
    ---

    # Notes
```

Why it passes: `name` is a slug equal to the directory (Findings §1/§2); the URL
is `https://` with two path segments and no credentials (Findings §2); `purpose`
is one sentence under 280 chars with no `#`/`": "`; `added` matches
`ISO_DATE_PATTERN`; `ref` matches `REF_PATTERN`; the body has exactly one `# Notes`
H1 and contains no `.agents/references/` literal (Findings §4).

### 10. Invalid entry — DECIDED example

Directory `.agents/@montflow/references/sveltekit/REFERENCE.md`:

```markdown
---
name: SvelteKit
url: http://github.com/sveltejs/kit.git
purpose: SvelteKit docs for the team
added: 2026-7-1
path: .agents/references/SvelteKit
ref:
---

# Notes

# Setup

Cloned into .agents/references/SvelteKit.
```

Verifier output for this entry (classes from Findings §7; 8 errors, 1 warning,
so the entry is invalid — agent default, i.e. the shape the tools return; the
`--human` renderer swaps the two leading tokens for `✗`/`⚠`, F17):

```
error .agents/@montflow/references/sveltekit/REFERENCE.md has 9 issues. Fix each one and run verify again.

1. [name] Must be lowercase alphanumeric groups joined by single hyphens.
2. [name] Must match the directory name 'sveltekit'.
3. [url] Must be an https:// URL; ssh and scp-style sources are not stored.
4. [purpose] Must end with '.'.
5. [added] Must be an ISO date (YYYY-MM-DD).
6. [path] The clone path is derived as <root>/.agents/references/sveltekit; it is never stored.
7. [body] Must contain exactly one '# Notes' heading.
8. [body] Body restates the derived clone path; clone state is derived at read time.
warn [ref] Drop the empty ref line; omit the key for a default-branch entry.
```

Class mapping for the example, in order: `name-slug`, `name-directory`,
`url-scheme`, `purpose-terminal`, `added-format`, `field-forbidden`,
`body-multiple-h1`, `body-derived`, plus the `ref-empty` warning. The purpose is
present and in range but has no final `.`, so it exercises `purpose-terminal`
rather than `purpose-missing`; `purpose-missing` keeps its own fixture in
C002's test set. Two further store-level cases, shown for completeness:

```
error .agents/@montflow/references/effect-smol/REFERENCE.md has 1 issue. Fix each one and run verify again.

1. [url] Duplicate URL after normalization; already registered as 'effect'.

error .agents/@montflow/references/vendor/REFERENCE.md has 1 issue. Fix each one and run verify again.

1. [entry] Directory 'vendor' has no REFERENCE.md.
```

(`effect-smol` cannot be added next to `effect`: same normalized URL, the
`effect`/`sveltekit` trap from A003:242–250.)

### 11. Fresh CI checkout verifies the registry with zero clones — DECIDED

The verifier reads only committed bytes and touches no clone:

1. Inputs — **committed bytes only**:
   `<root>/.agents/@montflow/references/*/REFERENCE.md` (and the store-root
   directory itself), plus `packages/references/skills/<skill>/*`. Nothing else:
   no installed skills, no `.gitignore`, no `.gitkeep`, no clone root.
2. Checks: the store root exists (else `store-root-missing`); every entry parses
   and satisfies Findings §2/§7; slug equality and uniqueness; normalized-URL
   uniqueness; body shape; clone path computed as a pure string (never `stat`ed);
   every committed packaged skill satisfies the skill standard
   (`Skill.verifyStandardSkillFile`, B003 §12) and its payload bytes match.
3. **Scope precedence (single statement, F6):** plain `verify` = committed store
   entries + committed packaged-skill bytes. `doctor` = scaffolding (store root,
   clone root, `.gitkeep`, ignore line via the one predicate in Findings §7/F8) +
   installed skill presence/freshness in `<root>/.agents/skills/`. `mf:check:references`
   runs both, so nothing is checked twice and nothing is skipped; B003 §13.3 is
   the normative copy of this split and C002/C006 must not implement the other's
   half.
4. Guarantees: no `git` invocation, no `fs.stat` anywhere under
   `.agents/references/`, **no installed-skill read**, no network, no clock.
   Clone presence, git validity, cleanliness, ahead/behind, ref resolution live
   only behind `verify --clones` / `status --fetch` (A003:291–323).
5. Why it is safe to demand: this worktree **is** the CI shape —
   `.agents/references/` holds only `.gitkeep` and all 14 clone directories are
   absent (A001:189–192), while the store path itself is committed, not ignored
   (`git check-ignore -v --no-index .agents/@montflow/references/effect/REFERENCE.md`
   → no output, exit 1; contrast `.agents/references/opencode` →
   `.gitignore:257`).
6. Acceptance tests C002 must ship: (a) a fixture root holding all 14 entries
   and an **empty** `.agents/references/` (only `.gitkeep`) → exit 0, zero
   issues; (b) the same fixture with installed skills deliberately stale → still
   exit 0 (that is doctor's check); (c) a fixture whose
   `.agents/@montflow/references/` directory is absent → exactly one
   `store-root-missing` issue, exit 1; (d) an **existing but empty** store
   directory → exit 0, 0 entries. The inverse fixture (clone present, no entry)
   is clean for `verify`, because a stray clone is not registry state.
7. Per-artifact local form (for docs/E003): one entry is
   `bun run --cwd packages/references cli verify <slug> --dir $PWD`; the
   whole-store form (`verify --all`) belongs to `mf:check:references`/CI only.
   Flag ownership is B003's, the addressing rule (by slug) is fixed here.

### 12. Where B002 must consume this contract (no git mechanics decided here)

B002 owns command sequences, flags, rollback, and fetch policy. It must take
these as given:

1. `ref` is a single opaque string; the entry never says whether it is a branch,
   tag, or commit. Resolution is `rev-parse`-based and must happen **inside the
   clone**, never inferred from the current checkout (Findings §3).
2. Absent/empty `ref` means "default branch": fast-forward only; never move a
   pinned entry's pin.
3. A pinned entry is checked out detached at the recorded ref; `status`'s
   `ref-mismatch` means `HEAD ≠ resolved(ref)`, not `HEAD ≠ default branch`.
4. `sync` clones into `clonePath(root, slug)` — the exact derivation in
   Findings §5, with no path input from the entry or the user — then checks out
   `ref` when present.
5. A ref that resolves to nothing inside a valid clone is the clone-scope issue
   `ref-unresolvable` (Findings §7, field `ref`; `verify --clones`/`status`
   only); the CI-safe verifier only shape-checks it (`ref-shape`), because
   resolving needs the clone.
6. Duplicate handling never reaches the git layer: `add` resolves normalized URL
   → `update` before any clone, and a slug taken by a different URL is refused
   before any clone (Findings §6).
7. `git check-ref-format` may back Findings §3's `REF_PATTERN` at clone time, but
   the pure pattern is the CI contract and the resolver applies **exactly** that
   predicate — one shape rule (Findings §3), two callers; neither may loosen it.
8. Whether `add` accepts `--ref` is B003's flag decision; if it does, the write
   order stays "clone succeeds → entry written" (SPEC:55) and the checkout
   failure path must leave neither clone nor entry.

## Open Questions

1. **Sign-off on the 14 authored `purpose` strings (Findings §8).** They are
   proposals — the current registry has no purpose data at all. B001 accepts them
   as the migration text; the orchestrator/user may reword, but C007 must write
   one fixed set verbatim, not improvise per file.
2. **Tag pin residual risk — CLOSED (F4 ruling).** The pin is the full commit
   `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`; the tag `v2.0.18` is recorded in
   the body notes (Findings §3, §8, §9). A force-moved upstream tag therefore
   cannot move the checkout; because the recorded value is a commit, a retag is
   **ignored** — B002 §5.2 runs its moved-tag refusal only for a tag-shaped `ref`
   (F24). The earlier `ref: v2.0.18` fallback is rejected: it left the pin at the
   mercy of upstream tag rewriting.
3. **`purpose` may not contain `": "`.** This rewrites several phase-A drafts
   (em dash instead of colon). It keeps the store valid under a real YAML parser
   as well as the repo's custom one; if the user wants colons, the ban must be
   lifted knowingly (Findings §2).
4. **Unknown frontmatter keys are warnings, not errors.** Consequence: a typo'd
   `ref` silently degrades to a default-branch entry and only warns. Promotion to
   error is a one-line change in C002 if the reviewer prefers strictness over
   forward-compatibility (Findings §2).
5. **`--ref` on `add`** (SPEC:55 lists none): a pinned entry exists in the
   contract, but whether the CLI can create one is B003's call; hand-editing is
   the fallback (Findings §12.8).
6. **A001 OQ5 — CLOSED (F8 ruling).** `.gitignore:257` also covers
   `.agents/references/.gitkeep` under `--no-index`, but the file stays **tracked**
   (`git ls-files .agents/references` → `.agents/references/.gitkeep`), so a
   checkout restores it. `doctor` repair recreates it when absent and stages it
   with `git add -f .agents/references/.gitkeep` when `<root>` is a git work tree
   (a plain `git add` is refused by the ignore rule); `doctor --check` only
   reports. **No `.gitignore` negation is added.** One ignore predicate is shared
   by `add`, `doctor`, and any check: trim, strip one leading `/`, strip a
   trailing `/`, compare to `.agents/references` (so `/.agents/references` and
   `.agents/references/` are the same line). B003 §7 owns the doctor rows.

## Handoff

- **B002 (git lifecycle):** consume Findings §3, §5, §6, §12 verbatim — ref is
  opaque, resolution inside the clone, detached checkout for pins, `sync` uses
  `clonePath(root, slug)`, duplicate routing happens before any clone.
- **B003 (CLI/tools):** duplicate key is the normalized URL (Findings §6); slug
  derivation order is URL → `--name` → slugified basename; per-entry addressing
  is `verify <slug>` / `show <slug>` with `--dir` as the workspace root; the
  `purpose`/`ref`/clone-state split is what `show`/`find` report (Findings §4).
- **B099 (phase review):** judge that every open point from TASK is a ruling, not
  a menu; that Findings §7 is a closed class list (34 ids: 27 store-scope, 7
  clone-scope); and that Findings §8 maps all 14 rows including the
  `cd9a14a6b6…` pin with `v2.0.18` in its notes.
- **C001 (scaffold):** create `.agents/@montflow/references/` as the store root
  (committed; it is not ignored — verified) and **no** `TEMPLATE.md`; the
  directory must exist even when it holds no entries (an absent directory is
  `store-root-missing`, Findings §7), so an empty store is legal but a missing
  one is not.
- **C002 (registry + verify):** implement Findings §2, §4, §6, §7 exactly —
  shared `parseMarkdown`/`fieldString` copy, `SLUG_PATTERN` reuse,
  `ISO_DATE_PATTERN` reuse, `Issue`-shaped findings, the 34 classes (27
  store-scope + 7 clone-scope), the `purpose-terminal` and `store-root-missing`
  checks, and the four CI-safe acceptance fixtures from Findings §11.6. Plain
  `verify` reads committed bytes only — installed skills are doctor's (Findings
  §11.3).
- **C003 (git lifecycle):** Findings §12; `clonePath` is shared, not duplicated.
- **C006 (skills + doctor):** doctor owns the store root (creates it), the clone
  root, `.gitkeep` (recreate + `git add -f` when recreated in a git work tree),
  the ignore line (one predicate, no negation), and installed-skill
  presence/freshness (SPEC:59, B003 §7); it must not "repair" the store contents —
  entries are authored, not generated.
- **C007 (migration + gate):** write all 14 entries from Findings §8 byte-for-byte
  (`url` verbatim, `purpose` as given, blame `added`), `opencode` pinned with
  `ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862` and tag `v2.0.18` in the notes,
  delete the source table in the same change,
  and add `mf:check:references` = CI-safe verify + `doctor --check`.
- **D001/D002 (alignment):** document the entry shape, the authoured-not-migrated
  status of `purpose`, and the scoped per-entry invocation
  `bun run --cwd packages/references cli verify <slug> --dir $PWD`
  (Findings §11.7). The store root `.agents/@montflow/references/` and the clone
  root `.agents/references/` differ by three characters of path — every doc must
  spell both out.

## Deviations

- **No mechanical gate exists for this task.** `GATES.md` is absent from the
  task directory and SPEC:83 lists B001 as `Gates: No`; TASK.md:33–37 asks for
  decisions, not verification. The only command run was the spec health check,
  output verbatim:
  `bun run --cwd packages/specs cli check --dir "$PWD"` →
  `6 specs · 0 failed · 0 issues`.
- **No `BOARD.md` entry and no `MAILBOX.md` note.** The spec directory holds
  `SPEC.md` plus task directories only; the profile's steps 5–6 have no target
  file. Same gap A001/A002/A003 recorded. Handoff lives above.
- **`purpose` strings are authored here, not migrated.** SPEC:66 says the rows
  migrate "verbatim"; the source table has no purpose column (A003:203–209), so
  verbatim can only mean `name` + `url`. Recorded explicitly rather than
  silently, and labelled PROPOSAL in Findings §8 per TASK.md:29.
- **No network, no clone, no git write.** The `opencode` pin's commit
  (`cd9a14a6b6…`) and the blame dates are cited from A003 (which verified them in
  the sibling worktree `/home/daniel/dev/montflow/main`); nothing was fetched or
  materialized here.
- **Only this file was written.** No `SPEC.md`, `TASK.md`, product code, skill,
  doc, gate, or other task directory touched; no timestamps, ids, or statuses
  invented.
