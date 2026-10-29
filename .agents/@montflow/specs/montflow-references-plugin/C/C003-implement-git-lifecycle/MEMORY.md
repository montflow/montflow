# Memory

## Context

- Task: **C003 — implement-git-lifecycle** (execution, gated), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin`.
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Task read: `.../C003-implement-git-lifecycle/TASK.md` (1–37) and
  `GATES.md` (1–18).
- Contract sources read in full: B002 `MEMORY.md` (922 lines — command
  sequences, rollback, network policy, ref resolver, `GitPort`, verb × state
  matrix, fixtures, §12 seam), B001 `MEMORY.md` (store contract, `ref` predicate,
  clone-path derivation), and B003 `MEMORY.md` §5/§12/§14 (engine ownership and
  downstream obligations).
- Implementation consumed: C001/C002 under `packages/references/` — the
  `Reference` entity and predicates, `ReferenceStore`, `CloneProbe`,
  `Verifier`, the module/app/service barrels, tests, and manifest.
- Scope executed: only `packages/references/` and this `MEMORY.md`. No CLI
  command, flag parser, renderer, plugin tool, doctor check, skill, doc, root
  script, CI cell, or store entry was added. `SPEC.md`, `TASK.md`, statuses,
  locks, and ledgers were not edited.
- Ownership interpretation: C003 supplies the pure store/git lifecycle
  operations and the `GitPort` seam. The CLI engine set (`add`, `update`,
  `updateAll`, `sync`, `status` over `StoreScope`, flags, and exit codes) stays
  C004's. The operations live in `src/modules/git/lifecycle.module.ts` and
  return structured results plus the exact agent-default line; C004 wraps them.

## Progress

Done, in order:

1. Read the profile, C003 `TASK.md`/`GATES.md`, B002 in full, B001, B003
   §5/§12/§14, the spec requirements, and the C001/C002 implementation.
2. Replaced the `modules/git` stub with the `GitPort` service, `Git.Default`,
   and the shared ref helpers (`tagName`, `branchName`, `isTagCandidate`,
   `resolveRemoteRef`, `firstLine`).
3. Added `modules/git/lifecycle.module.ts`: `GitLifecycle` service with `add`,
   `update`, `sync`, and `status`, plus result types and the shared ignore-rule
   predicate (`hasIgnoreRule`, `appendIgnoreRule`).
4. Refactored `CloneProbe` off its own `execFile`; it now uses `GitPort` only and
   preserves `CloneObservation`.
5. Extended the `Reference` module with `validateUrl` (B002 §2.1 reason
   strings), `deriveSlug`, and `normalizeOriginUrl` (https/ssh/scp origin key).
6. Made `ReferenceStore.write` atomic (`tmp` + rename), matching B002 §3.5.
7. Added 21 lifecycle tests against real temporary git repositories plus
   deterministic test-port overrides, and 6 pure ref/ignore/origin tests.
8. Ran all four gates and mapped every `GATES.md` checkbox to named tests.

## Findings

### 1. Files added / changed (all under `packages/references/`)

```text
src/modules/git/git.module.ts                       # GitPort, Git.Default, ref helpers
src/modules/git/lifecycle.module.ts                 # add/update/sync/status operations
src/modules/git/index.ts                            # barrel exports for both
src/modules/git/tests/git.test.ts                   # pure ref/ignore/origin cases
src/modules/git/tests/lifecycle.test.ts             # 21 real-repo lifecycle cases
src/modules/reference/reference.module.ts           # validateUrl, deriveSlug, normalizeOriginUrl
src/services/clone-probe/clone-probe.services.module.ts  # uses GitPort; no execFile
src/services/clone-probe/tests/clone-probe.test.ts  # layer now provides Git.Default
src/services/reference-store/reference-store.services.module.ts  # atomic tmp+rename write
```

No CLI file, renderer, doctor file, skill, doc, root script, CI file, or store
entry changed.

### 2. `GitPort` — the one git seam

`GitPort` is a `Context.Service` (`@montflow/GitPort`) declared with
`Git.Default = Layer.effect(...)`. `execFile('git', argv)` exists only inside
`Git.Default` in `git.module.ts`. Every command is argv-only with `-C <path>`
(no shell, no `cd`), a 30 s query timeout, a 300 s clone timeout, and
`LC_ALL=C` for stable stderr text.

Methods, exactly B002 §12's list plus the small extras the sequences need:

| Method | Contract |
|---|---|
| `isRepo` | `{ available, workTree }` from `rev-parse --is-inside-work-tree`; `ENOENT` sets `available: false` |
| `origin` | `remote get-url origin`, or `undefined` |
| `isShallow` | `rev-parse --is-shallow-repository` |
| `isDirty` | `status --porcelain=v1 --untracked-files=normal`; count + lines |
| `head`, `currentBranch` | `rev-parse HEAD`; `rev-parse --abbrev-ref HEAD` (detached → `undefined`) |
| `resolveRef` | B002 §2.6 order; returns `{ resolved, sha?, kind, tagCandidate, tagName }` |
| `defaultBranch` | `symbolic-ref --short refs/remotes/origin/HEAD`, then the upstream fallback |
| `counts` | `rev-list --left-right --count HEAD...<upstream>` → `{ ahead, behind }` |
| `clone` | `clone --quiet <url> <path>` (full; no depth/single-branch/submodules) |
| `fetch` | `fetch --prune --quiet origin` (never forced) |
| `fetchRef` | one explicit refspec, used only to repair a missing ref |
| `setHeadAuto` | `remote set-head origin --auto` |
| `lsRemote` | `ls-remote --quiet origin <patterns…>`; rows keep `^{}` verbatim |
| `checkoutDetached` | `-c advice.detachedHead=false checkout [ -f ] --detach <sha>` |
| `checkoutBranch` | `checkout [ -f ] -B <branch> <start>` |
| `fastForward` | `merge --ff-only <target>` |
| `resetHard`, `clean` | `reset --hard <target>`; `clean -fd` (never `-x`) |
| `addForce` | `add -f -- <paths…>` (the `.gitkeep` staging call) |

`resolveRef` precedence is commit-hex → tag (`refs/tags/<tagName>`) →
`refs/remotes/origin/<ref>` → `refs/heads/<ref>` → a literal `refs/...`. A
literal `refs/tags/v1` pin resolves through the normalized `v1` tag lookup, so
the prefix is applied exactly once.

`resolveRemoteRef(rows, name)` is the one `ls-remote`-row helper: peeled `^{}`
row first, then the plain row (lightweight tag), then branch rows. An undefined
result means the remote did not report the ref.

### 3. `GitLifecycle` — operations C004 calls

`GitLifecycle` (`@montflow/GitLifecycle`, `Git.GitLifecycleDefault`) depends on
`GitPort`, `ReferenceStore`, `CloneProbe`, `FileSystem`, and `Path`. It returns
structured unions and never parses a flag or sets a process exit code.

| Operation | Result shape |
|---|---|
| `add(root, input)` | `AddCreated` / `AddRouted` / `LifecycleFailure` |
| `update(root, target, {force, invocation})` | `UpdateCreated` / `UpdatePresent` / `UpdateUpdated` / `LifecycleFailure` |
| `sync(root, {name?, all?, invocation})` | `SyncReport` / `LifecycleFailure` |
| `status(root, {name?, fetch?, invocation})` | `StatusReport` / `LifecycleFailure` |

Every success and failure carries `message` with the exact line B002 specifies;
`sync` carries one `SyncEntry` per selected entry (`created`, `updated`, `ok`,
`skipped`, `failed`) and `failed` for the exit decision; `status` carries rows,
per-row `behind`/`ahead`/`failure`, `refused`, and the summary line.

`status` rows use `missing|present|dirty|ref-mismatch` plus `foreign` for the
refusal case B002 keeps out of the state vocabulary. C004 decides the exit code:
`status.refused` is true for a foreign path or a `--fetch` failure.

### 4. `add` — order and rollback

Implemented in B002 §3.1 order; every refusal lands before the first side
effect:

0. `git.isRepo(root)` → git missing / not-a-work-tree refusal.
1. `Reference.validateUrl` → https-only, with B002 §2.1 reason strings.
2. Validate `--name`, `--ref` (`Reference.isValidRef`), and `--purpose`
   (non-empty, one line, ≤280, ends `.`, no `#`/`": "`).
3. Normalize URL and look it up; a registered URL routes to `update <slug>` and
   returns `AddRouted` carrying the update result and the exact notice.
4. Derive/accept the slug; a slug already registered for another URL refuses
   before cloning.
5. Require `--purpose` for a new URL.
6. Refuse an existing clone path (including a symlink).
7. Scaffold: create the clone root, create `.gitkeep` only when absent (then
   `addForce` it), and append the ignore rule through the shared predicate.
8. Clone.
9. Resolve/checkout `--ref` (commit-hex → tag → branch; explicit refspec repair
   on a miss) and assert `HEAD`.
10. Write the entry last through the atomic store write.
11. Success line is exactly `created <slug> <url>` (no trailing `@ ref`).

Rollback removes the clone and the entry file/tmp created by this run; it never
removes a path that existed before the run and never follows a symlink. Clone
failure, ref failure, and entry-write failure are covered by tests.

### 5. `update`

- Classifies `target`: valid https URL, invalid URL (ssh/scp/http/file/local
  path, with the §2.1 reason), or name. Unknown URL gets the add-it-first line;
  unknown name points at `list`.
- Missing clone → materialize (clone, optional ref checkout, `created`).
- Foreign path → refusal naming the actual and expected origin.
- Dirty before network → refusal unless `--force`; force is checkout/reset/clean
  inside a proven clone only, never a re-clone or `rm -rf`.
- Fetch is plain `fetch --prune --quiet origin`; a failure returns
  `failed: fetch <slug>: … (clone unchanged at <sha7>)` before any mutation.
- Pinned entries resolve to a full SHA and `checkout --detach`; tag-shaped pins
  run the `lsRemote` + `resolveRemoteRef` moved-tag guard and refuse a move
  without touching HEAD. Commit-shaped pins never call `lsRemote`.
- Default-branch entries use `origin/HEAD` (with `set-head --auto` repair),
  refuse ahead/diverged work, fast-forward with `merge --ff-only`, and attach a
  detached/wrong branch with `checkout -B`.
- Every mutation asserts `HEAD`; no-op success is `present <slug>`, a real move
  is `updated <slug> head=<sha7>`.

### 6. `sync`

- Selection: `name` xor `all`; neither/both are refusals; unknown name refuses.
- `mkdir -p` the clone root is the only directory write; the registry is never
  written (tested byte-for-byte).
- Missing entry → full clone, optional recorded-ref checkout, `created`.
- Present entry → ownership, dirty skip, local ref repair/checkout (no fetch),
  default-branch attach, or `ok`; foreign/dirty/unique-commit cases are
  `skipped` with the `update <slug> --force` hint.
- No `--force`; no network except cloning missing entries.

### 7. `status`

- Offline default: `missing`, `present`, `dirty files=<n>`,
  `ref-mismatch` (pinned `head=`/`expected=` or `ref=<ref> unresolvable`;
  default `detached`/`branch=`/`no-upstream`), or a `refused:` foreign line.
- `--fetch` fetches only `present` entries with the unforced fetch. It adds
  `behind=<n>` then `ahead=<n>` for default-branch entries, and for a clean
  tag-shaped pin compares the local tag commit with
  `resolveRemoteRef`; a move becomes `ref-mismatch ref=<ref> expected=… remote=…`,
  a deleted upstream tag becomes `ref=<ref> unresolvable`. Commit pins are never
  queried.
- Summary line always last:
  `summary total=<n> missing=<n> present=<n> dirty=<n> ref-mismatch=<n> foreign=<n>`.
- Fully read-only offline; `--fetch` only updates remote-tracking refs/tags.

### 8. Test design

- Real temporary git repositories provide the clone/remote behaviour; no test
  uses the network.
- `lifecycle.test.ts` supplies a recording `GitPort` layer for `add`/`sync`
  (it maps the https argument to a local fixture and records the URL), and a
  raw-origin test port for clones configured with `url.<fixture>.insteadOf` so
  `remote.origin.url` stays the entry URL while fetch/ls-remote reach the
  fixture. The production port keeps B002's exact
  `git remote get-url origin` command.
- A failing `ReferenceStore` fake proves the add rollback path after a
  successful clone.
- Pure tests cover annotated/lightweight/deleted `ls-remote` rows, one-prefix
  tag normalization, ignore-rule equivalence, and https/ssh/scp origin
  normalization.

### 9. Gate output, verbatim

```text
$ bun run --cwd packages/references test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when using it.

 RUN  v5.0.4 /home/daniel/dev/montflow/reference-plugin/packages/references


 Test Files  14 passed (14)
      Tests  140 passed (140)
Type Errors  no errors
   Start at  15:35:44
   Duration  2.40s (import 46%, tests 41%, typecheck 7%, transform 6%)
```

```text
$ bun run --cwd packages/references ts:check
$ tsc --noEmit
```

(no findings, exit 0)

```text
$ bun run --cwd packages/references lint:check
$ oxlint --deny-warnings .
(node:1331241) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/oxlint.config.ts?cache=1793043347101 is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/package.json.
(Use `node --trace-warnings ...` to show where the warning was created)
(node:1331241) [MODULE_TYPELESS_PACKAGE_JSON] Warning: Module type of file:///home/daniel/dev/montflow/reference-plugin/tooling/oxlint/anti-slop/effect/index.ts is not specified and it doesn't parse as CommonJS.
Reparsing as ES module because module syntax was detected. This incurs a performance overhead.
To eliminate this warning, add "type": "module" to /home/daniel/dev/montflow/reference-plugin/tooling/oxlint/package.json.
```

(no lint findings, exit 0; the two `MODULE_TYPELESS_PACKAGE_JSON`
warnings are the same pre-existing environment noise C001/C002 recorded)

```text
$ bun run --cwd packages/references format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 183ms on 38 files using 16 threads.
```

### 10. `GATES.md` checkbox → named passing test

| Stage | Checkbox | Named test(s) |
|---|---|---|
| 0 | a failed `add` leaves neither a clone nor an entry | `GitLifecycle add > leaves neither a clone nor an entry when the clone fails`; `... > rolls the clone and entry back when the entry write fails` |
| 0 | `add` on an already-registered name or URL routes to `update` | `GitLifecycle add > routes an already-registered URL and name to update` |
| 0 | a slug collision with a different URL is refused before cloning | `GitLifecycle add > refuses a slug collision with a different URL before cloning` |
| 0 | `update` fast-forwards a default-branch entry | `GitLifecycle update > fast-forwards a default-branch entry and resolves by name and URL` |
| 0 | `update` checks out a recorded tag or commit | `GitLifecycle update > checks out a recorded tag and a recorded commit detached` |
| 0 | `update` refuses a dirty worktree unless forced | `GitLifecycle update > refuses a dirty worktree unless forced, and force discards changes` |
| 1 | `sync --all` clones every missing entry and changes no registry file | `GitLifecycle sync > sync --all clones every missing entry and changes no registry file` |
| 1 | sync with one name touches only that entry | `GitLifecycle sync > sync with one name touches only that entry` |
| 1 | `status` reports missing, present, dirty, and ref-mismatch offline | `GitLifecycle status > reports missing, present, dirty, and ref-mismatch offline`; `... > status --fetch reports behind then ahead and never fetches offline` (offline no-fetch assertion) |
| 1 | `status --fetch` reports behind and ahead | `GitLifecycle status > status --fetch reports behind then ahead and never fetches offline` |
| 1 | a network failure leaves the clone unchanged | `GitLifecycle update > leaves the clone unchanged when a fetch fails` |

Supporting task-required cases: `adds a reference, clones through the port, and
writes the entry last`, `checks out a recorded tag on add`,
`refuses an ssh, scp, file, or local-path argument before the port is called`,
`refuses add outside a git work tree without touching a clone`,
`refuses a foreign origin and an unknown URL or name`,
`refuses a moved tag without moving HEAD`,
`status --fetch reports a moved tag as ref-mismatch with remote=`,
`refuses a foreign clone path in status`, `skips a dirty clone and never writes
the registry`, and the six `Git ref helpers` cases (annotated/lightweight/
deleted rows, one-prefix tags, ignore-rule equivalence, origin normalization).

### 11. Scope proof

`git status --porcelain` after the work:

```text
 M bun.lock
?? .agents/@montflow/specs/montflow-references-plugin/
?? packages/references/
```

`bun.lock` was already modified by C001's install; this task ran no install and
changed no dependency. The spec directory was already untracked. Every product
file written is under `packages/references/`; the only spec file written is this
`MEMORY.md`. No CLI command, parser, renderer, tool, doctor check, skill, doc,
root script, CI cell, or store entry was touched.

## Open Questions

1. **C004 wiring.** `GitLifecycleDefault` requires `GitPort`, `ReferenceStore`,
   `CloneProbe`, `FileSystem`, and `Path`; C004's Live layer must provide
   `CloneProbe.Default` as well as `ReferenceStore.Default` and `Git.Default`.
   The operation results are intentionally structured, not rendered: the routed
   add needs both `notice` and `update`; a `status` fetch failure needs the row
   (last-known state) plus `failure`; `sync.failed` and `status.refused` drive
   the exit code. C004 owns that mapping and the `updateAll` loop.
2. **`status --fetch` counts only default-branch entries.** B002's example and
   `GitPort.counts` describe `HEAD...origin/<default>`; branch-pinned and
   tag/commit-pinned entries do not get `behind`/`ahead`. If C004 needs branch
   pin freshness, that is a new comparison (against `origin/<ref>`), not a
   renderer change.
3. **Production `origin` uses `remote get-url origin` verbatim (B002 §2.4).**
   Git applies `url.*.insteadOf` to that command, so a machine with a global
   rewrite may see the rewritten URL. Tests override `origin` to read
   `remote.origin.url` for the hermetic `insteadOf` fixtures; production was not
   changed. If ownership should ignore rewrites, switching to
   `git config --get remote.origin.url` is a one-line change but a B002
   deviation to decide, not a C003 change.
4. **`sync` ref failure after a successful clone leaves the clone.** B002
   defines add's creation rollback explicitly but not sync's; the implementation
   reports `skipped … unresolvable` and leaves the clone for `status`/a later
   `update`. A reviewer may prefer rolling that clone back. Add's rollback is
   exact and tested; sync's is not a rollback verb.
5. **`GitPort.isShallow` is implemented but unused.** B002 §12 lists it; no verb
   needs it today. Keeping it avoids a later port change when a shallow-clone
   diagnostic appears.

## Handoff

- **C004 (CLI + slash + tools):** use `Git.GitLifecycle` /
  `Git.GitLifecycleDefault` for `add`, `update`, `sync`, and `status`; loop
  `updateAll` over slugs. Render `message` for single results, `notice` then
  `update.message` for routed adds, one `SyncEntry.message` per sync row, then
  `status.summary` last. Honour `sync.failed` and `status.refused` for the exit
  code. Pass `invocation: 'mf-references'` or `'/mf-references'`; the
  default is `/mf-references`.
- **C004 input rules:** `add` wants `{ url, name?, purpose?, ref? }`; `purpose`
  is required for a new URL by the operation itself. `update` classifies a URL
  vs a name internally; pass the raw positional string. `sync` takes
  `{ name }` xor `{ all: true }`. `status` takes `{ name?, fetch? }`.
- **C005 (tools):** `reference_add` can call the same `add` operation; a routed
  result is a notice plus update result, not a success by itself
  (B002 §4.2/F11). `reference_find` is still C005's path-aware return.
- **C006 (skills + doctor):** `Git.hasIgnoreRule`/`Git.appendIgnoreRule` are the
  one shared ignore-rule predicate; doctor must still gate `git add -f` on a
  work tree. `sync <name>` is the offline repair verb and has no `--force`.
- **C007 (migration + gate):** the 14 entries should verify through
  `Verifier.verifyStore`; `add`'s output line is exactly
  `created <slug> <url>` with no `@ ref`, while update/sync materialization
  lines use `created <slug> <url> [@ <ref>]`. The `opencode` commit pin is
  commit-shaped → `update` never calls `lsRemote` for it.

## Deviations

- **Added `src/modules/git/lifecycle.module.ts` rather than keeping
  `git.module.ts` pure-port only.** B002 §12 says `git.module.ts` exposes
  `GitPort` and nothing verb-shaped; the orchestration prompt for C003 requires
  add/update/sync/status operations and their tests, and C004 is told to wire
  the CLI engines. The resolution is one extra module in the same `modules/git`
  group, with `GitPort` still in `git.module.ts` and no CLI/flag/renderer code
  anywhere. This is recorded because phase B cannot edit the C003 TASK.
- **`sync` and `status` are operations, not CLI commands.** No `src/apps/cli`
  file changed; `StoreScope`, `USAGE`, `RenderOptions`, the parser, and exit
  codes remain C004's.
- **Added `validateUrl`, `deriveSlug`, and `normalizeOriginUrl` to
  `modules/reference`.** `validateUrl` centralizes B002 §2.1's reason strings so
  `add` and `update` cannot disagree; `normalizeOriginUrl` is the B002 §2.2
  comparison key for ssh/scp origins. `normalizeUrl` (duplicate key) is
  unchanged.
- **`ReferenceStore.write` is now atomic (`tmp` + rename).** This matches B002
  §3.5 and lets `add`'s rollback remove a known temp path. Existing store tests
  still pass.
- **`GitPort.origin` production command is B002's `remote get-url origin`;
  tests override it only to neutralize `insteadOf` rewriting.** The override is
  test-local (`rawOrigin`), not shipped code.
- **Two test expectations were corrected during the work, not hidden:** the tag
  update fixture now starts the clone on the second commit so the detached
  checkout is a real move; and force-discarding a dirty tree reports `present`
  when `HEAD` did not move (the state is present; B002's `updated` line is for a
  real HEAD move).
- **No `BOARD.md`/`MAILBOX.md` broadcast.** Neither file exists in the spec
  directory, same gap every prior task recorded; the handoff above is the
  substitute.
- **No `GATES.md` edit.** Checkboxes and their named tests are recorded above;
  task state remains the orchestrator's.
