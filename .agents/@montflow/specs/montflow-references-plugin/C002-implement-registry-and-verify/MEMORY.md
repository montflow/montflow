# Memory

## Context

- Task: **C002 — implement-registry-and-verify** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Task read: `.../C002-implement-registry-and-verify/TASK.md` (1–38)
  and `GATES.md` (1–13).
- Contract sources read in full: B001 `MEMORY.md` (entry path, frontmatter
  schema, `ref` predicate, body rules, clone-path derivation, duplicate policy,
  the 34-class error table, valid/invalid examples) and B002 `MEMORY.md`
  §2.4/§2.5/§2.6 (clone path/ownership, dirty detection, ref resolution) plus
  §5/§8 (pin semantics, clone-scope issue classes).
- Scaffold consumed: C001 `MEMORY.md` and the live `packages/references/` tree
  (manifest, tsconfig, vitest config, barrels, stubs, `entry.test.ts`).
- Conventions re-read rather than assumed: `packages/reviews` review module and
  `review-store` service, `packages/skills` skill module, `packages/specs`
  frontmatter/verify/spec modules, `@effect/vitest` store tests.
- Scope executed: only `packages/references/` and this `MEMORY.md`. No CLI verb,
  plugin tool, doctor check, skill, doc, root script, CI cell, or store entry
  was added. No `SPEC.md`, `TASK.md`, status, lock, or ledger was edited.

## Progress

Done, in order:

1. Read the profile, C002 `TASK.md`/`GATES.md`, B001, B002, C001, and every
   named sibling implementation.
2. Copied the frontmatter subset parser into
   `src/modules/frontmatter/` (B001: “shared `parseMarkdown`/`fieldString`
   copy”; the package does not depend on `@montflow/specs`).
3. Replaced the `Reference` interface with an Effect `Schema.Class` carrying
   slug validation, and added the URL/ref/date predicates, `normalizeUrl`,
   `clonePath`, `entryPath`, `decodeReferenceFile`, `encodeReferenceFile`.
4. Implemented `verifyReferenceFile`, `verifyStore`, and the additive
   `verifyClone` mapping with the whole B001 issue table (27 store-scope,
   7 clone-scope) and per-entry attribution.
5. Implemented `ReferenceStore` over `<root>/.agents/@montflow/references`
   (`list`, `scan`, `readRaw`, `readOne`, `write`, `remove`, `exists`), with a
   missing root reading as empty.
6. Implemented the read-only `CloneProbe` service for
   `<root>/.agents/references/<slug>`: presence, directory shape, work-tree
   check, dirty count, HEAD/current ref, origin match, recorded-ref resolution
   and match. No mutation.
7. Added five colocated test suites (86 tests) covering round-trip, every
   invalid field, duplicates, ref shapes, dates, derived path, missing root,
   body rules, store I/O, and clone states against real temporary git repos.
8. Ran every mechanical gate and recorded the output below.

## Findings

### 1. Files added / changed (all under `packages/references/`)

```text
src/modules/frontmatter/frontmatter.module.ts     # copied parser + fieldString
src/modules/frontmatter/index.ts
src/modules/reference/reference.module.ts         # Schema.Class, codec, predicates, paths
src/modules/reference/tests/reference.test.ts
src/modules/verifier/verifier.module.ts           # 27 store + 7 clone issue classes
src/modules/verifier/tests/verify.test.ts
src/modules/git/git.module.ts                     # + CloneObservation (CloneState/RefKind kept)
src/modules/index.ts                              # + Frontmatter namespace
src/services/reference-store/reference-store.services.module.ts
src/services/reference-store/tests/store.test.ts
src/services/clone-probe/clone-probe.services.module.ts
src/services/clone-probe/index.ts
src/services/clone-probe/tests/clone-probe.test.ts
src/services/index.ts                             # + CloneProbe namespace
```

`src/tests/entry.test.ts` still passes unchanged, so the package entry, plugin
id, slash name, and path constants did not move.

### 2. Domain shape

- `Reference` is `Schema.Class<Reference>('Reference')` with `name`, `url`,
  `purpose`, `added`, optional `ref`. `name` carries
  `isMinLength(1)`, `isMaxLength(64)`, and `isPattern(SLUG_PATTERN)`, so an
  invalid slug cannot be constructed through the schema.
- `SLUG_PATTERN`, `ISO_DATE_PATTERN`, `REF_PATTERN`, `COMMIT_PATTERN`,
  `REFERENCE_KEYS`, `FORBIDDEN_KEYS` are exported for C003/C004 and tests.
- `isValidRef` is the single B001 §3 predicate: charset `[A-Za-z0-9._/-]`,
  1–255 chars, rejects leading `/`/`.`/`-`, `//`, `@{`, trailing `/`/`.`,
  `..`, any component ending `.lock`, and purely-hex values outside 7–40
  lowercase hex. C003 must import this, never re-list it (B002 §2.6/F22).
- `isValidUrl` accepts only `https:`, no credentials/query/fragment/whitespace/
  backslash, a dotted host, ≥2 non-empty path segments, no `.`/`..`, and at
  most one trailing `.git`.
- `clonePath(root, slug)` is pure string derivation
  (`<root>/.agents/references/<slug>`) with trailing root slashes normalized;
  `entryPath(slug)` is `.agents/@montflow/references/<slug>/REFERENCE.md`.
- `decodeReferenceFile` returns `{ reference, body }` and
  `encodeReferenceFile` emits canonical key order (`ref` omitted when absent)
  with the body preserved byte-for-byte. Round-trip is asserted for both a
  pinned and a default-branch entry.
- Unknown frontmatter keys are warned (`field-unknown`); the five forbidden
  clone-path keys are errors (`field-forbidden`), per B001 §2.

### 3. Store and probe

- `ReferenceStore` is a `Context.Service` with a `Default` layer over
  `FileSystem`/`Path`. `list` returns sorted slugs; `scan` returns
  `{ present, entries: [{ slug, raw?, extraFiles }] }`; `readRaw` returns bytes;
  `readOne` returns a decoded `Reference` (invalid bytes fail with
  `StoreError`); `write` writes canonical bytes and creates the tree; `remove`
  deletes the entry directory (missing = failure); `exists` checks the entry
  file. Missing store root: `list` → `[]`, `scan` → `{ present: false }`.
- `CloneProbe` is a `Context.Service` with a `Default` layer over
  `FileSystem`, using argv-only `execFile('git', …)` queries (`rev-parse
  --is-inside-work-tree`, `status --porcelain=v1 --untracked-files=normal`,
  `rev-parse HEAD`, `rev-parse --abbrev-ref HEAD`, `remote get-url origin`,
  and B002 §2.6 ref resolution). It returns `CloneObservation`, added to
  `modules/git` next to `CloneState`/`RefKind`. No clone is written.
- `verifyStore` accepts a `StoreSnapshot` and never touches a clone; a
  `present: false` snapshot emits exactly one `store-root-missing` issue. The
  clone-scope pass is separate: `verifyClone(observation, reference)` maps the
  seven B001 clone classes and is only called by `verify --clones` later.

### 4. Issue-class coverage

`STORE_ISSUE_IDS` exports all 27 store-scope ids and `CLONE_ISSUE_IDS` all 7
clone-scope ids. Every id has a message and field exactly as B001 §7 tabulates
(`frontmatter`, `name`, `entry`, `url`, `purpose`, `added`, `ref`, the forbidden
key itself, `body`, `store`, `path`, `git`, `origin`, `dirty`, `head`).
Attribution: a store entry block's `entry` is
`.agents/@montflow/references/<slug>/REFERENCE.md`; store-level classes use the
bare store root where B001 requires it. Duplicates are emitted once per later
owner in deterministic slug order, naming the first owner, which reproduces
B001 §10's `effect-smol` example.

### 5. Gate output, verbatim

```text
$ bun run --cwd packages/references test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/reference-plugin/packages/references


 Test Files  10 passed (10)
      Tests  86 passed (86)
Type Errors  no errors
   Start at  15:09:04
   Duration  967ms (import 66%, typecheck 15%, tests 13%, transform 7%, worker 1%)
```

```text
$ bun run --cwd packages/references ts:check
$ tsc --noEmit
```

(no findings, exit 0)

```text
$ bun run --cwd packages/references lint:check
$ oxlint --deny-warnings .
(node:1203697) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/oxlint.config.ts?cache=1793041749608 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1203697) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/tooling/oxlint/package.json.
```

(no lint findings, exit 0; the two `MODULE_TYPELESS_PACKAGE_JSON` warnings are
pre-existing environment noise from `oxlint.config.ts` and the anti-slop plugin,
identical to C001's recorded run)

```text
$ bun run --cwd packages/references format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 267ms on 35 files using 16 threads.
```

### 6. `GATES.md` checkbox → named test

| Stage | Checkbox | Named test(s) |
|---|---|---|
| 0 | a valid `REFERENCE.md` round-trips through decode and encode | `Reference schema and codec > round-trips a pinned entry and preserves body notes`; `... > omits an absent ref when encoding a default-branch entry` |
| 0 | a missing store reads as empty, not as a failure | `ReferenceStore > reads a missing root as empty, not as a failure` |
| 0 | a duplicate slug is rejected | `verifyStore > rejects a duplicate slug naming the first owner` |
| 1 | every invalid field yields one issue naming the entry and the field | `verifyStore > names the entry and the field for every invalid field` (also the per-field `verifyReferenceFile` cases) |
| 1 | the clone probe distinguishes missing, clean, dirty, and ref-mismatch | `CloneProbe > reports a missing clone without touching the filesystem`; `... > reports a clean clone at the recorded commit`; `... > reports a dirty clone with its changed-path count`; `... > reports a ref mismatch when HEAD is not the recorded commit` |
| 1 | `verifyStore` passes with no clone present | `verifyStore > verifies an existing store without any clone present` |

Supporting cases the task explicitly listed: ref shapes (`accepts every valid
ref shape and reports invalid ones`, `accepts branch, tag, and 7-40 char commit
refs only`), dates (`reports added dates that are not YYYY-MM-DD`), derived path
(`derives the clone path and the store-relative entry path`), missing root
(`reports an absent store root as exactly one store issue`), body violations
(`reports every body violation`), duplicates (`rejects a duplicate URL after
normalization`), store I/O (`writes, scans, reads, and removes one entry`,
`preserves body notes across write and read`), and clone states
(`reports an unresolvable recorded ref`,
`reports a directory that is not a git work tree`).

### 7. Scope proof

`git status --porcelain` after the work:

```text
 M bun.lock
?? .agents/@montflow/specs/montflow-references-plugin/
?? packages/references/
```

`bun.lock` was already modified by C001's `bun install`; this task ran no
install and changed no dependency. The spec directory was already untracked.
No file outside `packages/references/` and this `MEMORY.md` was written.

## Open Questions

1. **Clone probe ownership vs C003.** C001's handoff assigned `modules/git` and
   the `GitPort`/`execFile` seam to C003, but C002's task explicitly requires a
   clone probe now. The probe lives in `services/clone-probe`, uses the same
   `execFile` seam and `CloneObservation` type, and is read-only. C003 should
   either keep it and add mutating verbs behind the same service, or move it
   under `GitPort` without changing the observation shape. One lint suppression
   (`montflow/no-node-platform-imports`) justifies the CLI shell-out; it is the
   only suppression in the task.
2. **Store write surface for C004.** `write(root, reference, body)` writes
   canonical bytes only. If a future verb must write a hand-edited raw file, it
   needs a separate `writeRaw`; C002 deliberately did not add one.
3. **Acceptance fixtures.** B001 §11.6 asks for a fixture with all 14 migrated
   entries. C002 tests the same four shapes (valid store + absent clone root,
   missing store root, empty store, and a valid multi-entry store) with authored
   fixtures, but does not duplicate the migration data — C007 writes the real 14
   entries byte-for-byte. If the reviewer wants the 14-row fixture before C007,
   that belongs to the migration task.
4. **`verifyStore` returns clean entries too.** Each block carries `issues: []`;
   C004's renderer should filter to non-empty blocks and count errors plus
   warnings exactly as B001 §7 specifies. This was chosen so callers can inspect
   the full snapshot without a second scan.
5. **Default invocation text.** Actionable messages use `/mf-references` unless
   a caller passes `VerifyOptions.invocation`; C004/C006 must pass their own
   invocation when the renderer differs.

## Handoff

- **C003 (git lifecycle):** reuse `Reference.clonePath` and
  `Git.CloneObservation`; B002 §2.6 ref resolution is implemented read-only in
  `services/clone-probe` and should be extracted to the shared resolver rather
  than re-listed. Mutating verbs must add no path input and no store write on
  failure.
- **C004 (CLI + slash):** `ReferenceStore.scan(root)` feeds
  `Verifier.verifyStore(snapshot, options)`; `verify --clones` should call
  `CloneProbe.probe` then `Verifier.verifyClone(observation, reference)`.
  `STORE_ISSUE_IDS`/`CLONE_ISSUE_IDS` are the stable id lists for renderers and
  tests.
- **C005 (tools):** `reference_find` can use `list`/`readOne`; `reference_add`
  can construct `Reference` through the schema and `write` with a `# Notes`
  body.
- **C006 (skills + doctor):** doctor owns creating the store root and clone
  root; `verifyStore` only reports `store-root-missing`. The store service
  creates entry directories on `write`, not on scan.
- **C007 (migration + gate):** the verifier now enforces the exact B001 §7
  messages/fields; the 14 entries must satisfy
  `verifies an existing store without any clone present` with an empty
  `.agents/references/`.
- **D001/D002 (alignment):** document the two trees, the derived path, and the
  five fields; the README still says “scaffolded, not implemented” and is out of
  this task's scope.

## Deviations

- **Added a copied frontmatter module.** B001's handoff asked for the shared
  `parseMarkdown`/`fieldString` copy and C001 did not depend on
  `@montflow/specs`; the copy lives in `modules/frontmatter` rather than inside
  `reference.module.ts` to keep module boundaries and a colocated test surface.
- **Added a `clone-probe` service.** The task requires a clone probe while C001
  gave git mechanics to C003; the read-only probe is isolated in its own service
  so C003 can replace or absorb it without touching the registry.
- **No `GATES.md` edit.** The checkboxes and their named tests are recorded
  above; task state is the orchestrator's.
- **No `BOARD.md` or `MAILBOX.md`.** Neither exists in the spec directory (same
  gap every prior task recorded), so the handoff above is the broadcast.
- **No 14-entry migration fixture.** See Open Question 3; C002 proves the
  verifier with authored fixtures and leaves the real registry to C007.
- **One test failure was fixed during the work, not hidden:** the ref test
  initially listed a 40-char hex string as invalid (it is a legal full commit),
  so the test was corrected to use a 41-char value rather than loosening the
  predicate.
- **Only `packages/references/` and this `MEMORY.md` written.** No network, no
  clone, no store entry, no git write.
