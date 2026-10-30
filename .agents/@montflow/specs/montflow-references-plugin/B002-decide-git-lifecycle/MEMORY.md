# Memory

## Context

- Task: **B002 — decide-git-lifecycle** (planning), spec
  `montflow-references-plugin`, in-place workspace at
  `/home/daniel/dev/montflow/reference-plugin` (HEAD `a94972e`, branch
  `feat/reference-plugin`).
- Binding rules read: `.agents/@montflow/profiles/spec-worker/PROFILE.md`
  (1–53). Spec read: `SPEC.md` (1–101; requirements 51–73 authoritative).
  Task read: `.../B002-decide-git-lifecycle/TASK.md` (1–40). Evidence read:
  `A001-map-reference-surface/MEMORY.md` (1–455),
  `A003-map-consumers-and-migration/MEMORY.md` (1–446), and the phase-A review
  series `.agents/@montflow/reviews/references-plugin-a/` (005 read in full).
- Dependency state: **B001 had not run when this record was first written** —
  `B001-decide-registry-store-contract/` held only `TASK.md` and a placeholder
  `MEMORY.md`. B001 has since landed (`B001/…/MEMORY.md`, 720 lines), and this record
  was reconciled with it in review round 001 (`references-plugin-b/001`, findings
  F1–F16): the store contract consumed here is B001's **MEMORY**, not its TASK.
  Bindings that changed as a result: `url` is **https-only** (B001 §2, §2.1
  here), the `opencode` pin is the **full commit** with the tag in notes (B001
  §3), and `verify --clones` uses B001 §7's named clone-scope classes. Entry path
  `.agents/@montflow/references/<slug>/REFERENCE.md`, slug equals directory and
  frontmatter `name`, fields `name`, `url`, `purpose`, `added`, optional
  **string** `ref`, clone path derived as `<root>/.agents/references/<slug>` and
  never stored. Nothing here redefines that schema; `ref` is read verbatim as a
  string and only trimmed, and its shape is B001 §3's predicate.
- Work-order sources that **do not exist** for this spec: no `PHASE.md`, no
  `BOARD.md`, no `MAILBOX.md` (`ls` of the spec dir shows SPEC.md plus 23 task
  directories only), and this task dir has **no `GATES.md`**. Nothing was
  broadcast; see Deviations.
- Scope discipline: the only file written is this `MEMORY.md`. No product code,
  skill, doc, spec, gate, or other task file touched. Sibling worktrees were
  read only with non-mutating `git` queries (`rev-parse`, `status`,
  `symbolic-ref`, `branch`, `tag`, `cat-file`, `config --get`); no checkout,
  fetch, or write happened there.
- Goal: fix firm runnable semantics for `add`, `update`, `sync`, `status` —
  exact git commands, exact states, exact messages, exact rollback — before
  C003 writes any git code.

## Progress

1. Read profile, SPEC, TASK, both phase-A MEMORYs, the phase-A review series.
2. Re-verified every repo fact this task depends on: clone root contents,
   `.gitkeep` tracking, `.gitignore` rule, absence of
   `packages/references` and `.agents/@montflow/references` (§Findings 1.1).
3. Inspected the two real clones in the sibling worktree
   `/home/daniel/dev/montflow/main/.agents/references/` and recorded their
   origin, branch, HEAD, cleanliness, tags, shallow and refspec facts
   (§Findings 1.2).
4. Built throwaway git 2.55.0 fixtures under `/tmp/opencode/gitexp/` to prove
   every command recorded below: clone → tag/branch/commit checkout, detached
   HEAD detection, dirty detection, `--ff-only` success and divergence,
   `rev-list --left-right --count` orientation, moved-tag fetch, fetch failure
   containment, clone failure cleanup, `checkout -B` tracking setup,
   `checkout -f`, `clean -fd`, offline ref resolution.
5. Wrote the decisions in §Findings 2–11 and the verb × state matrix in §10.
6. Ran the spec check required by the receipt
   (`bun run --cwd packages/specs cli check --dir "$PWD"`) — see Handoff.

## Findings

### 1. Baseline this decision is written against

#### 1.1 Current repo state (re-verified, not inherited)

| Fact | Command | Result |
|---|---|---|
| Clone root holds nothing but the placeholder | `ls -la .agents/references/` | `.gitkeep` (0 bytes) only |
| Placeholder is tracked | `git ls-files .agents/references` | `.agents/references/.gitkeep` |
| Ignore rule | `grep -n references .gitignore` | `257:.agents/references` |
| No store yet | `ls -d .agents/@montflow/references` | No such file or directory |
| No package yet | `ls -d packages/references` | No such file or directory |
| Zero clones here | `find .agents/references -maxdepth 2` | `.gitkeep` only |

Consequence: every verb below is designed to run in a checkout with **zero
clones** (this worktree, and CI). `status` must print 14 × `missing`, `sync`
must materialize, `verify` (no `--clones`) must not touch git.

#### 1.2 The two real cases (sibling worktree, read only)

`/home/daniel/dev/montflow/main/.agents/references/opencode`:

| Property | Observed value | Command |
|---|---|---|
| origin | `https://github.com/sst/opencode.git` | `git remote get-url origin` |
| branch | `dev` | `git rev-parse --abbrev-ref HEAD` |
| HEAD | `23e3493ab2efb6b8c00725cfd652b7f946af5343` | `git rev-parse HEAD` |
| clean | empty output | `git status --porcelain` |
| default branch | `origin/dev` | `git symbolic-ref --short refs/remotes/origin/HEAD` |
| upstream | `origin/dev` | `git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` |
| pin (observed) | tag `v2.0.18` → `cd9a14a6b688d4021bee381dfd39d2cef9c0f862`, **lightweight tag**; the entry records the **commit**, the tag is the citation (B001 §3) | `git rev-parse 'v2.0.18^{commit}'`; `git cat-file -t v2.0.18` → `commit` |
| at pin? | **no** (`HEAD` ≠ `cd9a14a`) | string compare |
| shallow | `true`, 1 boundary commit, 19 033 commits reachable | `git rev-parse --is-shallow-repository`; `.git/shallow` |
| refspec | `+refs/heads/dev:refs/remotes/origin/dev` (single-branch) | `git config --get-all remote.origin.fetch` |
| `origin/main` offline | unresolvable (exit 1) | `git rev-parse --verify --quiet 'origin/main^{commit}'` |

`/home/daniel/dev/montflow/main/.agents/references/pi-subagents`:

| Property | Observed value |
|---|---|
| origin | `https://github.com/nicobailon/pi-subagents.git` |
| branch / HEAD | `main` / `60905d1001805db11f25f72e75346329dadbc821` |
| clean | yes (`git status --porcelain` empty) |
| tags | none (`git tag -l` empty) |

So `opencode` is the live `ref-mismatch` fixture and `pi-subagents` the live
`present` fixture. The `opencode` clone is **shallow and single-branch** (created
by the old hand-run skill, not by this tool) — a case the decision must tolerate,
see §8.5.

### 2. Shared primitives (one implementation, used by every verb)

#### 2.1 URL syntax validation (`add` input policy — https only, no network)

`add` validates the string **before any clone** and accepts exactly one form:

| Form | Example | Rule |
|---|---|---|
| https | `https://github.com/sst/opencode.git` | scheme `https`, host with a dot, path ≥ 2 segments; B001 §2 shape rules (no credentials, query, fragment, `.`/`..` segment, whitespace, backslash) |

Everything else is refused with an explicit reason; nothing is cloned, no entry is
written, exit 1:

| Input | Reason text |
|---|---|
| `ssh` URL (any user/port) | `ssh URLs are not stored; use the https URL` |
| scp-style source (`user@host:path`) | `scp-style sources are not stored; use the https URL` |
| `http://…` | `insecure scheme http; use https://` |
| `git://…` | `insecure scheme git; use https://` |
| `file://…`, `/abs/path`, `./rel`, `~/x`, `../x` | `local paths and file:// are not accepted; use the https URL` |
| `github.com/a/b` (no scheme) | `missing scheme; use https://` |
| `https://github.com` / `https://github.com/a` | `missing repository path (expected <host>/<owner>/<repo>)` |
| any `?` or `#` | `query strings and fragments are not allowed` |
| any `..` segment, `//` in path, control chars, whitespace | `invalid path` |
| host without a dot (`https://localhost/a/b`) | `invalid host` |

**Rationale (F1):** the store's verifier refuses every non-https `url` (B001 §2
rule 4, `url-scheme`), so accepting an ssh/scp argument would let a successful
`add` write an entry its own CI rejects. `add` is therefore the first line of that
policy, not a second opinion: an actor who only has an ssh remote must translate
it to its https URL before registering. A future transport is a new field, never
a new stored spelling.

**No pre-flight `ls-remote` for reachability.** Reachability is proven by the
clone itself: one network round-trip instead of two, and no TOCTOU window between
probe and clone. A `git clone` failure is the reachability verdict and its stderr
is the message. (`GitPort.lsRemote` exists for the moved-pin guard and for
`status --fetch`, §5.2/§9.2 — never as an `add` preflight.)

#### 2.2 URL normalization (dedupe and origin ownership, one function)

Normalization is a **comparison key only**, never a writer. It accepts the
spellings a *pre-existing clone* may carry as its `origin` (ssh/scp), because
ownership (§2.4) must still be provable for clones created by hand or by the old
skill; it is never reachable from an `add` argument, which §2.1 has already
restricted to https.

```
normalizeUrl(u):
  1. trim
  2. https form  https URL                   -> host/path
  3. ssh form    ssh URL (optional user/port) -> host/path      # origin comparison only
  4. scp form    user@host:path               -> host/path      # origin comparison only
  5. anything else                            -> no key (origin uncomparable -> foreign)
  6. strip trailing '/' (repeatedly)
  7. strip one trailing '.git'
  8. strip trailing '/' again
  9. lowercase host and path
 10. output '<host>/<path>'   (no scheme, no user, no port, no .git)
```

Properties this buys, all required by A003 §3a:

- `https://github.com/Effect-TS/effect-smol` and a future
  `https://github.com/effect-ts/effect-smol.git` are the same entry (case and
  `.git`).
- `https://github.com/SigNoz/signoz` and `https://github.com/signoz/signoz` are
  the same entry.
- A hand-made clone whose origin is the scp spelling (`user@host:path`) still
  proves ownership of the entry `https://github.com/sst/opencode.git` — the clone
  is matched, not rewritten (no verb ever runs `git remote set-url`, §2.4).

The stored `url` is the https string the user passed, after §2.1 validation
(trimmed); it is never rewritten, downgraded, or re-spelled. Migration keeps all
14 strings exactly as registered (B001 §6/§8).

#### 2.3 Slug derivation (`add --name` overrides; B001's slug rule wins)

```
last   = final segment of the URL path after stripping '.git'
slug   = last.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
valid  = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)   # packages/skills/src/modules/skill/skill.module.ts:17-18
```

- `https://github.com/sst/opencode.git` → `opencode`.
- `https://github.com/Effect-TS/effect-smol` → `effect-smol`, but that URL is
  registered as `effect`; the duplicate-URL check (§4.2) runs first, so `add`
  routes to `update effect` and never derives `effect-smol`.
- `https://github.com/sveltejs/kit.git` → `kit`, same story (`sveltekit`).
- A name that does not validate after derivation (e.g. a repo segment of `.` or
  a non-ASCII name) is refused with `refused: cannot derive a slug from <url>;
  pass --name <slug>`; `add` never guesses further.
- `--name` is validated by the same regex, plus: non-empty, no `/`, no `.`/`..`,
  no leading `-`. Failure: `refused: invalid name '<n>': must match
  ^[a-z0-9]+(-[a-z0-9]+)*$`.
- Length caps (if B001 sets one) are applied to both paths by B001's validator;
  B002 does not invent a second limit.

#### 2.4 Clone path and ownership proof

Path is always derived, never stored: `<root>/.agents/references/<slug>`
(B001/Spec 53). Ownership check, in this order, with no writes:

```
[ -L <path> ]                        && -> foreign (symlinks are refused, even dangling)
[ -e <path> ]                        || -> state: missing
git -C <path> rev-parse --is-inside-work-tree      # must print "true", exit 0
git -C <path> remote get-url origin                # must exit 0
normalizeUrl(<origin>) == normalizeUrl(<entry.url>) # else foreign
```

Observed exits that the implementation must branch on:

| Case | Command output | Exit |
|---|---|---|
| work tree | `true` | 0 |
| directory, not a repo | `fatal: not a git repository …` | 128 |
| path missing | `fatal: cannot change to '<path>': No such file or directory` | 128 |

`origin` missing → `git remote get-url origin` exits 2 → foreign.

**Mismatch behavior (firm):** no verb ever repairs ownership. It never runs
`git remote set-url`, never deletes, never checks out inside a directory it
cannot prove. It refuses, names both URLs, and tells the user to remove the
directory and `sync`:

```
refused: <slug> at .agents/references/<slug> has origin <actual>, expected <entry.url>;
  remove the directory and run '<invocation> sync <slug>'
```

`--force` does **not** override ownership. Force only discards modifications
inside a proven clone (§5.4); deleting an unproven directory is never the tool's
call, and deleting a proven one is not `--force`'s job either — a re-clone is the
explicit pair `remove <slug>` + `sync <slug>` (§8.5).

#### 2.5 Dirty detection (exact)

```
git -C <path> status --porcelain=v1 --untracked-files=normal
```

- Non-empty output = dirty; the number of lines is the reported count.
- Modified, staged, deleted, renamed, and untracked files all count (proved:
  ` M file.txt`, `A  staged.txt`, `?? scratch.txt` → 3 lines).
- Ignored files (`node_modules`, `dist`) do **not** count — git excludes them by
  default (`--untracked-files=normal`, no `-x`), so a reference clone that
  someone ran `bun install` in is still `present`.
- No `--ignore-submodules` games: mf-references never initializes submodules, so
  submodule dirt is not expected and would surface as `-dirty` only if present.
- Exit 0 whether clean or dirty; the list is the signal, not the exit code.

The dirty check is the only guard that protects local work; `git checkout` is
**not** a barrier. Proved in the sandbox:

- With an untracked file present, `git checkout --detach <sha>` succeeded
  (exit 0) and carried the untracked file across — no protection.
- With `file.txt` modified, checkout refused (`error: Your local changes … would
  be overwritten by checkout`, exit 1) and HEAD stayed put.
- `git checkout -f` discarded the tracked modification and **kept** the
  untracked file; only `git clean -fd` removed it (and left ignored files).

So: check dirty first; `--force` = `checkout -f` / `reset --hard` **plus**
`clean -fd` (never `-x`).

#### 2.6 Ref resolution (from B001's string `ref`)

`ref` is a string; trim it. Empty or whitespace-only = **default branch**.
Non-empty is resolved deterministically, never by "whatever HEAD is":

```
resolveRef(path, ref):
  # 0. shape gate: B001 §3's REF_PATTERN, called as the one exported predicate
  #    CI verify uses — never re-listed, never re-implemented here (F22). It
  #    rejects a leading '/', any '//', any '@{', a leading '.' or '-', a
  #    trailing '/' or '.', any '..', any component ending '.lock', a backslash,
  #    whitespace/control, and the git-reserved ~ ^ : ? * [   -> unresolved
  # 1. commit-ish: 7-40 lowercase hex
  if /^[0-9a-f]{7,40}$/.test(ref):
      sha = git -C path rev-parse --verify --quiet '<ref>^{commit}'      # exit 1, silent, when absent
  # 2. tag wins over branch for a pin (immutable release marker)
  else if sha = git -C path rev-parse --verify --quiet 'refs/tags/<ref>^{commit}'
  # 3. the remote's branch, not the possibly-stale local one
  else if sha = git -C path rev-parse --verify --quiet 'refs/remotes/origin/<ref>^{commit}'
  # 4. local branch (offline fallback for clones not created by us)
  else if sha = git -C path rev-parse --verify --quiet 'refs/heads/<ref>^{commit}'
  # 5. full refname form 'refs/...' is accepted verbatim (B001 §3's charset and
  #    rejects allow it), resolved as-is rather than re-prefixed
  else if ref starts 'refs/' and sha = git -C path rev-parse --verify --quiet '<ref>^{commit}'
  else fail -> unresolved
```

Step 0 is not optional: B001 §3's shape rule and this resolver are the **same
predicate** (F9, F22). C003 imports the predicate from the registry module
(C002) and calls it as one function; the reject list in the snippet above exists
only to make the gate readable, and the normative source is B001 §3 rule 2 —
which also rejects a leading `.`/`-`, a trailing `/`/`.`, and any `..`. Without
step 0, `ref: /main` or `ref: feat//x` passes CI `verify` and then fails every
clone with `ref-unresolvable`; with it, an unsatisfiable value can never be
committed. A resolver that re-derives its own shape list is the exact divergence
this step exists to prevent.

**One shape *class* predicate (F31).** `refShape(path, ref)` is what
`update`/`status --fetch` gate the tag guard on, and it is the same sentence
B001 §3 states — one predicate, two records, no local variant:

```
refShape(path, ref) -> 'commit' | 'tag' | 'branch'
  /^[0-9a-f]{7,40}$/.test(ref)                    -> commit     # step 1
  name = tagName(ref)                             # one leading 'refs/tags/' removed
  ref is bare, or starts 'refs/tags/', and
    'refs/tags/<name>' resolves (§2.6 step 2)      -> tag        # tag-shaped candidate that IS a tag
  otherwise                                       -> branch     # 'refs/heads/…', 'refs/remotes/…', or a non-tag name

tagName(ref) = ref with one leading 'refs/tags/' removed   # 'refs/tags/v1' -> 'v1'; 'v1' -> 'v1'
```

The class follows the resolution order above (commit → tag → `origin/<ref>` →
local branch → literal `refs/...`): whatever the resolver actually reached is
what the ref is. A **tag-shaped candidate** is a bare `<name>` or the literal
`refs/tags/<name>` spelling; it is class `tag` — and gets the moved-tag guard —
only when `refs/tags/<name>` actually resolves in the clone. `refs/heads/<name>`,
`refs/remotes/<name>`, and a bare name with no tag of that name are
**branch-shaped** and never get the guard. Two normalizations follow from this and
are normative:

- A **literal** `refs/tags/v1` is the same pin as `v1`. Both are tag-shaped
  candidates, both resolve locally, and both must query `refs/tags/v1` /
  `refs/tags/v1^{}`: the `lsRemote` patterns, the explicit tag refspec, and
  `resolveRemoteRef`'s argument are all built from `tagName(ref)`, never from the
  raw value, so the prefix is applied exactly once and a doubled one is
  unreachable by construction (§5.2, §9.2, §12).
- A **bare name that resolves only to a branch** (no `refs/tags/<name>`, resolved
  through step 3/4) is branch-shaped and does **not** get the tag guard: there is
  no tag to move, so `HEAD != resolveRef(ref)` (§8.3) is the whole check.

Proved behaviours the resolver relies on: `rev-parse --verify --quiet` prints
nothing and exits 1 for an unknown ref (no stderr to confuse the compact
output); `'<ref>^{commit}'` peels annotated tags to the commit; a bare branch
name resolving through `refs/heads/*` can be stale, hence the tag-then-remote
order; `v2.0.18` in the real `opencode` clone resolves offline to `cd9a14a…`.

Pick a **specific** implementation rule: resolution never fetches. Verbs decide
when to fetch *before* resolving (§7).

#### 2.7 Default branch (for entries with no `ref`)

```
git -C <path> symbolic-ref --short refs/remotes/origin/HEAD   # "origin/dev"; exit 1 when unset
# network-allowed repair when unset (update only, after a successful fetch):
git -C <path> remote set-head origin --auto                   # prints "origin/<branch>"
```

Offline fallback when `origin/HEAD` is missing (hand-made clones): the branch
the clone currently has checked out is accepted as the default **only if** it has
an upstream (`git rev-parse --abbrev-ref --symbolic-full-name '@{u}'` exits 0);
otherwise the entry is `ref-mismatch`. Our own clones always have `origin/HEAD`
because `git clone` sets it (proved: `refs/remotes/origin/main`).

### 3. `add <url>` — decision

#### 3.1 Order of operations (firm, and it is what makes rollback exact)

Validation first, then routing, then writes — every refusal happens before the
first side effect (F19).

0. **Require a git work tree at `<root>`** (F30). `<root>` is the resolved `--dir`
   (default `process.cwd()`); `GitPort.isRepo(<root>)` — the `git -C <root>
   rev-parse --is-inside-work-tree` check §2.4 already defines — must print
   `true`. Otherwise refuse here, before validation, routing, scaffolding, or any
   clone: `failed: <root> is not a git work tree; run '<invocation> add --dir
   <repo-root>' from inside a work tree`, exit 1, nothing written. The registry
   is a **committed** store (SPEC:52) and step 7 stages `.gitkeep` with `git add -f`
   (§3.4), so a directory outside git can hold neither: registering there would
   write an entry no commit can carry and silently skip the staging. This is the
   step §4.4's not-a-work-tree row fires from, and it makes §3.4's staging
   unconditional. A missing `git` binary surfaces here first: `ENOENT` uses
   §3.2's `failed: git is not installed or not on PATH` instead of the
   not-a-work-tree text.
   SPEC:55 lists no flag and no precondition here; it does not forbid one, and
   the store's committed nature is the reason.
1. **Validate URL syntax** (§2.1). Nothing else happens before this.
2. **Validate the fields that were passed.** `--purpose`, when given, must be
   non-empty, one line, 1–280 chars, end with `.`, and contain no `#` and no
   `": "` (B001 §2 — the same rules `verify` enforces, so `add` cannot write an
   entry its own CI rejects); `--ref`, when given, must pass B001 §3's shape gate
   (§2.6 step 0); `--name`, when given, must match
   `^[a-z0-9]+(-[a-z0-9]+)*$`. A failure is a `refused:` line, exit 1, with
   **zero side effects** — no scaffolding, no clone, no store write (§4.4).
3. **Normalize** the URL; look it up in the store (§4.2). If registered → route
   to `update` and stop the add path. A routed add needs no `--purpose`: nothing
   is registered or cloned (B003 §2.7).
4. **Resolve the slug** (`--name` or derivation, §2.3); if the slug is
   registered with a *different* URL → refuse (§4.3).
5. **Require `--purpose` for the new URL** when it was not passed:
   `refused: --purpose is required to register a reference`, exit 1 — still
   before any preflight, scaffold, clone, or store write.
6. **Preflight the clone path**: if `<path>` exists in any form → refuse.
   `add` never adopts an existing directory.
7. **Ensure scaffolding** (SPEC:54, before cloning): `mkdir -p
   .agents/references`, create `.gitkeep` only when absent, ensure `.gitignore`
   contains the rule. Details in §3.4.
8. **Clone** into the final path (§3.2).
9. **Resolve and check out `--ref`** when given (§3.3).
10. **Write the entry** (§3.5) — last, only after 8–9 succeeded.
11. Print exactly one success line and exit 0:
    `created <slug> <url>` (§11). No second line, no trailing state line.

**Rollback implication (F19).** Steps 0–5 refuse with nothing on disk and no
network call, so §3.6's rollback covers only step 8 onward (clone exit ≠ 0, ref
checkout, `HEAD` assertion, entry write). A refused `add` therefore never
performs a network clone and never leaves the §3.4 scaffolding behind; the order
this replaces could do both by cloning first and refusing at the write.

#### 3.2 Clone arguments (exact)

```
git clone --quiet <url> <root>/.agents/references/<slug>
```

- No `--depth`, no `--single-branch`, no `--shallow-submodules`, no `--bare`,
  no `--mirror`, no `--recurse-submodules`: mf-references always creates a full
  clone (the `opencode` fixture shows what a hand-made shallow clone costs, §8.5).
- No `--no-checkout`: the default branch is checked out by clone, which is
  exactly the no-ref end state.
- `--quiet` because the tool prints one deterministic line; git chatter would
  pollute the agent-first output. Errors are still captured (stderr is non-empty
  even with `--quiet`).
- The URL and path are passed as **separate `execFile` argv entries**, never
  through a shell (`sh -c`, backticks, string concat). A URL is user input; no
  shell interpretation is acceptable.
- `git` missing from `PATH` (`ENOENT` from `execFile`) → `failed: git is not
  installed or not on PATH`, exit 1, nothing written.

#### 3.3 `--ref` on add (engine contract; B003 owns the flag spelling)

The engine takes `ref?: string` (B003 exposes `--ref <branch|tag|commit>`).
After a successful clone:

```
target=$(resolveRef(<path>, <ref>))     # exactly the §2.6 precedence, nothing different here
```

(§2.6 is the single resolver: commit-hex first, then tag, then `origin/<ref>`, then
local branch, then a literal `refs/...`. A literal `refs/tags/<name>` pin is
tag-shaped there, and every tag lookup below uses the normalized `tagName(ref)` =
`<name>`, so the refspec is built from `<name>` and never from the raw literal —
F31.)

If unresolvable, try the **explicit refspec** (works, proved):

```
git -C <path> fetch --quiet origin 'refs/tags/<name>:refs/tags/<name>'
git -C <path> fetch --quiet origin 'refs/heads/<ref>:refs/remotes/origin/<ref>'
git -C <path> fetch --quiet origin '<sha>'        # commit form; servers may refuse unreachable SHAs
```

Then re-resolve. Still unresolved → **roll back** (recursively delete `<path>`,
nothing written) and report:

```
refused: <slug> ref '<ref>' does not resolve in <url>; nothing was written
```

On success:

```
git -C <path> -c advice.detachedHead=false checkout --detach <40-hex-sha>
git -C <path> rev-parse HEAD            # must equal <sha>
```

Two details this pins down:

- **Resolve to a full SHA first, then check out the SHA.** The reasons are
  DWIM/ambiguity (a bare name can be a branch, a tag, or a remote branch, and
  git's disambiguation changes with local state), the detached contract (a pin
  is a commit, not a branch attachment — §8.2), and the post-checkout assertion
  (`rev-parse HEAD` must equal the resolved SHA, which only a SHA gives you).
  A bare branch name with `--detach` is *not* rejected by git — verified
  `git checkout --detach dev` exits 0 in the 2.55.0 fixture — it is simply
  ambiguous, which is enough to forbid it here.
- `-c advice.detachedHead=false` suppresses the four-line hint so default output
  stays one line per entry.
- Branch refs are also detached on purpose: a pin means "this commit", not "this
  local branch". Moving a pin is a store edit, not an update.

#### 3.4 Scaffolding `add` writes before cloning (SPEC:54)

| Target | Rule |
|---|---|
| `<root>/.agents/references/` | `mkdir -p`; idempotent |
| `<root>/.agents/references/.gitkeep` | create a 0-byte file only when absent; when this run created it, stage it with `git add -f .agents/references/.gitkeep` — unconditionally, because §3.1 step 0 already proved `<root>` is a work tree (the ignore rule also matches it, so a plain `git add` is refused); never add a `!.agents/references/.gitkeep` negation |
| `<root>/.gitignore` | read; apply the one ignore predicate — trim the line, strip one leading `/`, strip a trailing `/`, compare to `.agents/references`; if no line matches, append `.agents/references` on its own line, adding a leading `\n` when the file does not end with one; never rewrite, reorder, remove, or negate other lines |

The ignore predicate is the **same** function in `add`, `doctor`, and any check
that reads the file (F8): `/.agents/references`, `.agents/references/`, and
`.agents/references` are one rule, so a fork that already anchored the line never
gets a duplicate. `.gitkeep` stays tracked and doctor repair recreates + stages
it; no `.gitignore` negation exists.

`add` and `doctor` share one rule, applied at different scopes (F30): `add` has
already refused at §3.1 step 0 unless `<root>` is a work tree, so **its** staging
is unconditional and its work-tree gate is the whole verb. `doctor` must also run
in a tarball checkout with no work tree (B003 §7), so **every git-touching report
or repair it makes — the `gitkeep` staging — happens only inside a work tree**:
it recreates the 0-byte file everywhere but skips the `git add -f` when
`isRepo(<root>)` is false. Its remaining repairs (`store-root`, `clone-root`,
`.gitignore`, the packaged skills) are file writes that spawn no git command,
which is why they are allowed outside a work tree; it never runs `rev-parse`,
`status`, `fetch`, or any other query. So the work-tree gate is per-verb for
`add` and per-check for `doctor`, and `add` is the only verb that refuses to
register outside one.

These three writes are **not rolled back** when the clone fails. They are
required by `doctor` anyway, they are idempotent, and reverting a shared file
(`.gitignore`) risks clobbering a concurrent edit. SPEC:55's rollback guarantee
is about the clone and the entry, and both are still guaranteed (§3.6).

#### 3.5 What is written, and when

The entry is written **only after** clone + ref checkout succeeded:

| Field | Source |
|---|---|
| `name` | resolved slug (== directory) |
| `url` | the validated https argument, trimmed — never re-spelled or normalized (§2.2) |
| `purpose` | `--purpose <text>` (required by the engine for a *new* URL; B003 exposes the flag); trimmed, non-empty, one line, 1–280 chars, ends with `.`, no `#` and no `": "` (B001 §2). When passed it is validated at §3.1 step 2; when absent it is required for a new URL at §3.1 step 5 — both refusals land before any scaffold, clone, or store write, so no `purpose-*` issue can ever come from `add`'s own writer |
| `added` | local date at run time, `YYYY-MM-DD` |
| `ref` | `--ref` value verbatim after trim; omitted when not passed |
| body | B001's body contract; `add` writes no notes |

Write is atomic and local to the entry directory:

```
mkdir -p <root>/.agents/@montflow/references/<slug>
write    <root>/.agents/@montflow/references/<slug>/.REFERENCE.md.tmp
rename   .REFERENCE.md.tmp -> REFERENCE.md
```

Every write in this section runs on a root §3.1 step 0 has already proven to be a
git work tree, so the entry and the staged `.gitkeep` are always commit-ready; a
non-git root never reaches here (F30).

#### 3.6 Exact rollback

Track exactly what this run created. On **any** failure after step 7 of §3.1
(clone exit ≠ 0, ref checkout failure, HEAD ≠ resolved SHA, entry write failure):

```
delete-tree <root>/.agents/references/<slug>         # recursive; only because preflight proved it absent
rm -f  <root>/.agents/@montflow/references/<slug>/.REFERENCE.md.tmp
rm -f  <root>/.agents/@montflow/references/<slug>/REFERENCE.md   # only if this run created it
rmdir  <root>/.agents/@montflow/references/<slug>                # only when empty
```

- `git clone` already removes its own partial directory on failure (proved:
  failed clone → `ls: cannot access 'brokenclone': No such file or directory`),
  but the defensive recursive delete is unconditional **because preflight proved
  the path did not exist**, so it can only delete what this run created.
- This is **creation rollback, not force semantics**: `add` deletes only a path
  it created in the same run. No verb ever deletes an existing directory, and a
  re-clone is the explicit `remove` + `sync` pair (§8.5).
- Refusals from §3.1 steps 0–5 never reach here: they happen before the first
  write, so there is nothing to roll back and no network call was made (F19).
- Never recursively delete a path that existed before the run; never follow a
  symlink (preflight refuses symlinks).
- If rollback itself fails, report both errors and name the leftover path:
  `failed: clone rolled back but <path> could not be removed: <msg>`; `status`
  will then report it as foreign/orphan. Exit 1 either way.
- On success the result state is `present` (clean, on the default branch, or at
  the pin).

### 4. Idempotent path and refusals

#### 4.1 Ordering: validation → URL lookup → slug collision

1. URL syntax validation (§2.1) runs **first**. A malformed URL can never match
   a registered entry (registered URLs are valid by construction), and
   validating first stops a typo from being routed into `update` and producing a
   misleading "unknown URL" message.
2. Duplicate **URL** lookup runs next, before slug derivation effects are
   applied. This is the A003 §3a trap: re-adding
   `https://github.com/Effect-TS/effect-smol` must route to `update effect`,
   never create `effect-smol`; re-adding `https://github.com/sveltejs/kit.git`
   must route to `update sveltekit`, never create `kit`.
3. Slug collision is checked last, because a derived slug is only meaningful
   once we know the URL is new.

#### 4.2 Already registered (name or URL) → route to `update`

- If `normalizeUrl(arg)` equals a registered entry's normalized URL → route to
  `update <registered slug>`, even when `--name` was passed and differs.
- If `--name` is given and that name is registered with the same normalized URL
  → route to `update <name>`.
- Routing report: exactly one notice line, then update's own result lines:

```
routed add -> update <slug>: <url> is already registered as <slug>
present <slug>            # or whatever update produced, including a refusal
```

- **The routed line is a notice, not a result (F11).** Success is only the
  following `present` / `created` / `updated` line **plus exit 0**; a following
  `refused: …` / `failed …` line or exit 1 must be surfaced as a failure by every
  caller (binary, slash, and the add skill — B003 §11). The engine returns
  `{ kind: 'routed', slug, url, update: UpdateResult }` so a renderer cannot
  lose the distinction, and the tool's return string carries the same split
  (B003 §8).
- Exit code is **update's** exit code. `add` never clones a second copy.
- Real case: `mf-references add https://github.com/sst/opencode.git` must never
  produce a second clone; it routes to `update opencode` (and on a fresh
  worktree that clones and checks out the pin, §5).

#### 4.3 Slug collision with a different URL

```
refused: slug '<slug>' is already registered for <registered-url>;
  pass --name <other-slug> to register <url> under a different name
```

- Nothing is cloned, no entry is written, exit 1.
- Concrete: `add https://github.com/someone-else/effect` refuses because slug
  `effect` belongs to `https://github.com/Effect-TS/effect-smol`; `add --name
  effect https://github.com/someone-else/other` refuses the same way.
- The same rule covers `--name` colliding with a registered slug.

#### 4.4 Other `add` refusals

| Situation | Message | Exit |
|---|---|---|
| clone path exists, no entry | `refused: .agents/references/<slug> already exists but no entry is registered for <slug>; remove it or run '<invocation> status'` | 1 |
| invalid URL | `refused: invalid url '<u>': <reason>` | 1 |
| invalid name | `refused: invalid name '<n>': must match ^[a-z0-9]+(-[a-z0-9]+)*$` | 1 |
| invalid purpose | `refused: invalid purpose '<text>': <reason>` (non-empty, one line, 1–280, ends with `.`, no `#`/`": "` — B001 §2) | 1 |
| missing purpose | `refused: --purpose is required to register a reference` | 1 |
| clone failed | `failed: clone <url> -> .agents/references/<slug>: <stderr first line>` | 1 |
| entry write failed | `failed: could not write .agents/@montflow/references/<slug>/REFERENCE.md: <msg>; clone removed` | 1 |
| not a git work tree (root) | `failed: <root> is not a git work tree; run '<invocation> add --dir <repo-root>' from inside a work tree` | 1 |

Every row above is triggered from a numbered §3.1 step, and every refusal lands
before the first side effect: `not a git work tree` at step 0 — the earliest
check, before validation; `invalid URL` at step 1; `invalid name` and a
`--purpose` that fails its shape at step 2; `missing purpose` at step 5; the
orphan-path row at step 6; the clone and entry-write failures at steps 8–10. No
refused `add` clones, scaffolds, or writes (F19, F30).

### 5. `update <name|url>` — decision

#### 5.1 Resolution

| Argument shape | Classification | Lookup | On miss |
|---|---|---|---|
| `https://…` | URL | `normalizeUrl` equality | `refused: unknown url <url>; run '<invocation> add <url>' first` |
| other scheme / scp form / local path (`ssh`, `http`, `file`, `user@host:path`, `/abs`, `./x`) | invalid URL — refused by §2.1, never looked up | none | `refused: invalid url '<u>': <§2.1 reason>` |
| anything else | name | exact slug equality | `refused: unknown reference '<name>'; run '<invocation> list'` |

The unknown-**URL** message is the add-it-first one the task requires; unknown
**name** does not suggest add (a name is not a URL) — it points at `list`.
Names cannot contain `://`, so classification is unambiguous, and a non-https
argument never silently becomes a name lookup.

#### 5.2 Sequence

```
path = <root>/.agents/references/<slug>

# missing -> materialize exactly like sync (§6.2), reported as "created <slug> <url>"
if [ ! -e path ]: clone; if ref: resolve+checkout; assert; done

assertOwnership(path)                       # foreign -> refuse, no writes
if isDirty(path) and not --force:           # before any network contact
    refuse with the dirty message (§5.4)

# fetch: never '--force', never a forced tag fetch — a retagged tag must not
# move a pin (F4)
git -C path fetch --prune --quiet origin

if ref:
    name = tagName(ref)                     # 'refs/tags/v1' -> 'v1' (§2.6); unused for commits/branches
    target = resolveRef(path, ref)          # §2.6 predicate, no fetch yet
    if unresolved:                          # materialize without rewriting
        git -C path fetch --quiet origin 'refs/tags/<name>:refs/tags/<name>'          # no '+', no --force
        git -C path fetch --quiet origin 'refs/heads/<ref>:refs/remotes/origin/<ref>'
        git -C path fetch --quiet origin '<sha>'    # commit form; servers may refuse unreachable SHAs
        target = resolveRef(path, ref)      # still unresolved -> refusal (§5.6), HEAD untouched
    if refShape(path, ref) == tag:          # §2.6's one predicate: 'v1' and 'refs/tags/v1' are both tags
        # moved-tag guard: the local tag's commit vs the commit the remote tag names.
        # lsRemote is a GitPort method (§12); engines never call execFile. Its
        # rows -> sha lookup is resolveRemoteRef (§12, defined there once):
        # peeled '^{}' row first (annotated tag), else the plain row
        # (lightweight tag — its own sha *is* the commit), else the branch rows.
        local  = resolveRef(path, 'refs/tags/<name>')       # §2.6 literal refs/ form; peels '^{commit}'
        rows   = lsRemote(path, ['refs/tags/<name>', 'refs/tags/<name>^{}'])
        remote = resolveRemoteRef(rows, name)               # undefined = remote did not report it
        if remote is undefined:
            refuse (§5.6 unresolvable)       # upstream no longer names the tag
        if remote != local:
            refuse (§5.6 moved-pin message)  # never checkout, never write the store
    if head(path) != target:
        git -C path -c advice.detachedHead=false checkout --detach <target>
    assert head(path) == target             # else report failure, leave as git left it
else:
    default = defaultBranch(path)           # origin/HEAD; set-head --auto as repair
    if currentBranch(path) == default:
        # ahead = rev-list --count origin/<default>..HEAD ; behind = rev-list --count HEAD..origin/<default>
        if ahead > 0 and not --force: refuse (§5.4, carries both counts)
        if --force: git -C path reset --hard 'refs/remotes/origin/<default>'; git -C path clean -fd
        else if behind > 0: git -C path merge --ff-only 'refs/remotes/origin/<default>'
        else: no-op                          # already at origin/<default>
    else:                                   # detached or on another branch
        if uniqueCommits(currentBranch or HEAD, origin/<default>) > 0 and not --force: refuse (§5.4)
        if --force: git -C path checkout -f -B <default> 'refs/remotes/origin/<default>'; git -C path clean -fd
        else:       git -C path checkout -B <default> 'refs/remotes/origin/<default>'
    assert head(path) == rev-parse 'refs/remotes/origin/<default>'
```

**The guard's scope is the ref's shape (F24, F31).** A commit-shaped `ref` (7–40
hex) is resolved by §2.6 step 1 and never enters the tag branch: the recorded
value is a commit, immutable by content, so a retag of the tag it once came from
changes neither `HEAD` nor `resolveRef(ref)`. `update` therefore makes **no**
`lsRemote` call for it and reports `present`; the `opencode` pin is exactly this
case (B001:458). Only a **tag-shaped** `ref` runs the comparison, because there
the recorded value *is* the movable tag — and "tag-shaped" is §2.6's
`refShape`, the one predicate B001 §3 states: a bare `<name>` or literal
`refs/tags/<name>` candidate whose `refs/tags/<name>` actually resolves in the
clone, with the literal spelling normalized by `tagName` before every lookup. A
bare name that resolves only to a branch is **branch-shaped** and gets no tag
guard (no tag to move); a literal `refs/heads/<name>` likewise. This closes the
spelling gap where `refs/tags/v1` skipped the guard and a raw-prefix lookup would
have turned it into a false `unresolvable` — both are now the same pin as `v1`.

**The comparison is between full commits on both sides (F26).** `local` is the
tag peeled to a commit (`refs/tags/<name>^{commit}`); `remote` is the commit the
remote tag names, taken from the `lsRemote` rows by `resolveRemoteRef` (§12) —
the peeled `^{}` row for an annotated tag, the plain row for a lightweight tag,
because `git ls-remote` emits **no** `^{}` line for a lightweight tag and its
plain row is authoritative. Indexing the rows by ref string is not the contract;
the helper is defined once in §12 and reused by §9.2.

Proved details backing this sequence:

- `git merge --ff-only refs/remotes/origin/<default>` on a behind clone
  fast-forwards; on a diverged clone it exits 128 with
  `fatal: Not possible to fast-forward, aborting.` and **HEAD does not move**
  (verified before/after).
- `git merge --ff-only` on an ahead-only clone prints `Already up to date.` and
  exits 0 — which is why the ahead check is explicit. Without it, `update` would
  claim success while `status --fetch` reports `ahead=N`.
- `git checkout -B <default> refs/remotes/origin/<default>` sets the upstream
  automatically (verified: `branch=main upstream=origin/main`).
- `git checkout -f -B …` discards tracked modifications, keeps untracked files →
  `git clean -fd` is required and is safe for ignored files (verified:
  `node_modules/x` survived, `scratch2.txt` removed).
- `git symbolic-ref --short refs/remotes/origin/HEAD` → `origin/main` / `dev`.
- `git fetch --tags` on a retagged upstream prints
  `! [rejected] v1 -> v1 (would clobber existing tag)` and exits 1, while the
  local tag stays at the recorded commit; the same holds for an explicit
  `refs/tags/<ref>:refs/tags/<ref>` refspec without `+` (both verified). That
  rejection **is** the pin's immutability guard: `update` reads it as "upstream
  moved", confirms it with `lsRemote` (§12), and refuses — it never retries with
  `--force`.
- `git rev-list --left-right --count HEAD...origin/<default>` prints
  `ahead<TAB>behind` (verified 0/1 then 1/1); `rev-list --count
  origin/<default>..HEAD` is the ahead count used for the pre-check.

#### 5.3 Behaviour per entry kind

| Entry | `update` does | Never does |
|---|---|---|
| no `ref` | fetch, ensure the default branch is checked out, fast-forward it | merge, rebase, or move the pin |
| `ref` = tag | fetch without `--force`; resolve the local tag; if the remote commit the tag names (§12 `resolveRemoteRef`: the `^{}` row, else the plain row for a lightweight tag) differs, **refuse** (moved pin); a tag the remote no longer reports is unresolvable (§5.6); otherwise detached checkout at the resolved commit | follow a retagged tag, force-update a local tag |
| `ref` = branch | fetch, resolve `refs/remotes/origin/<ref>`, detached checkout at its commit | attach to a local branch |
| `ref` = commit | fetch, resolve the recorded SHA (explicit fetch on miss, no `+`), detached checkout; unresolvable → refuse | rewrite the SHA, move the pin, or query `lsRemote`/refuse on a retag — a commit is immutable by content (F24) |

Pinned fetch semantics are deliberate (F4): the pin is immutable, so `update`
must be able to *detect* an upstream move, not absorb it. A plain fetch never
rewrites a moved tag (verified: the local tag stayed at the old commit), and
`--tags`/explicit refspecs **without** `--force` reject the clobber and leave the
local tag alone. The `lsRemote` comparison applies to **tag-shaped** refs only
(F24; a commit pin is never queried) and turns a move into
`refused: <slug> ref '<ref>' now resolves to <sha7> upstream, the pin records
<sha7>; edit the pin` — HEAD untouched, store untouched. A forced tag fetch is
never used: it would silently follow a retag and break the specs that cite the
old commit.

#### 5.4 Dirty worktree and `--force`

Default refusal, exit 1:

```
refused: <slug> is dirty (<n> changed paths); run '<invocation> update <slug> --force' to discard local changes
```

`--force` on a proven clone means:

```
git -C <path> checkout -f (--detach <sha> | -B <default> <start-point>)
git -C <path> reset --hard <target>
git -C <path> clean -fd            # never -x: ignored dependency dirs survive
```

Force is required for three distinct situations, each with its own message so an
agent can tell them apart (ahead-only and diverged share one message, because
both carry `ahead <n>` and `behind <n>`; `<n>` is the real count for each):

| Situation | Message (no `--force`) |
|---|---|
| dirty tree | `refused: <slug> is dirty (<n> changed paths); run '<invocation> update <slug> --force' to discard local changes` |
| ahead or diverged default branch | `refused: <slug> cannot fast-forward origin/<default> (ahead <n>, behind <n>); pass --force to reset` |
| branch switch would drop unique commits | `refused: local branch '<branch>' has <n> commits not on origin/<default>; pass --force to discard` |

Force never crosses an ownership boundary (§2.4) and never deletes a directory,
never re-clones, and never moves a pin. It is exactly: discard tracked changes,
discard untracked files (`clean -fd`, never `-x`), then place HEAD on the target.
A clone whose refspec is genuinely too narrow is rebuilt only by the explicit
`remove <slug>` + `sync <slug>` pair (§8.5).

#### 5.5 No-op success

Up-to-date default branch, or already at the pin → no git mutation, one line,
exit 0:

```
present <slug>
```

#### 5.6 Unresolvable `ref`

After fetch + explicit-refspec attempts:

```
refused: <slug> ref '<ref>' does not resolve in <url>;
  update the pin in .agents/@montflow/references/<slug>/REFERENCE.md
```

Moved pin (tag names a different commit upstream than the local tag):

```
refused: <slug> ref '<ref>' now resolves to <sha7> upstream, the pin records <sha7>;
  edit the pin in .agents/@montflow/references/<slug>/REFERENCE.md
```

The moved-pin message requires an upstream sha. When `lsRemote` reports **no**
matching row for a tag-shaped pin (tag deleted upstream), `resolveRemoteRef`
returns `undefined` and the refusal is the **unresolvable** one above — never
the moved-pin text, which would claim a sha that was never read (§5.2, §12).

HEAD is left exactly where it was, and the store is never written. `status`
reports `ref-mismatch` for both refusals, with the token the case actually
deserves (§8.3): the **unresolvable** case prints `ref=<ref> unresolvable`; the
**moved** case prints `ref=<ref> expected=<sha7> remote=<sha7>` — the local tag
commit and the commit the remote reports — because the pin still resolves and
calling it `unresolvable` would be false (F29). `verify --clones` is local and
CI-safe (SPEC:60): it emits `ref-unresolvable` (field `ref`, B001 §7) only when
the local tag does not resolve, and never reports a remote move.

### 6. `sync [name] [--all]` — decision

#### 6.1 Selection and usage

| Invocation | Result |
|---|---|
| `sync <name>` where the name is registered | one entry |
| `sync --all` | every entry, sorted by slug |
| neither | `usage: <invocation> sync <name>` (or `<invocation> sync --all`), exit 1 |
| both | `usage: pass either <name> or --all, not both`, exit 1 |
| unknown name | `refused: unknown reference '<name>'; run '<invocation> list'`, exit 1 |

#### 6.2 Per-entry algorithm (sequential, sorted, no parallelism)

```
mkdir -p <root>/.agents/references            # the only dir write, always
for entry in selection (sorted by slug):
  if missing:
      clone (full, §3.2); if ref: resolve + detached checkout; assert
      -> "created <slug> <url>" (+ " @ <ref>")     # never the derived path
  else:
      assertOwnership                     # foreign -> "skipped <slug> foreign ..." (exit 1)
      if dirty:
          "skipped <slug> dirty (run '<invocation> update <slug> --force')"
      else if ref and head != resolved:
          resolved locally (no fetch): checkout --detach -> "updated <slug> @ <ref>"
          unresolvable: "skipped <slug> ref '<ref>' unresolvable (run '<invocation> update <slug>')"
      else if no ref and (detached or wrong default branch):
          unique commits on the abandoned branch: skip with the update --force hint
          origin/<default> absent locally: skip with the update hint
          checkout -B <default> refs/remotes/origin/<default>   -> "updated <slug> branch <default>"
      else:
          "ok <slug>"
```

- **`sync` never fetches.** Its network use is confined to cloning missing
  entries (§7). This makes it the offline repair verb: in the real `opencode`
  clone, `sync opencode` resolves the recorded commit (`cd9a14a6…`, or the tag
  `v2.0.18` that points at it) locally and checks it out with no network at all.
- **`sync` never writes the registry** (SPEC:57). No store file, no `REFERENCE.md`
  rename, no `.gitignore`, no `.gitkeep` — only `mkdir -p .agents/references`
  and the clone/checkout contents. Rationale: the store is the user's authored
  intent; `sync` is derived materialization. A verb that rewrote the store could
  not be run idempotently from a skill, and CI would see a tracked-file diff.
- **`sync` has no `--force`** (F7; TASK:25/SPEC:57 fix `sync [name] [--all]`, and
  B003 §2.5 owns the drop). A dirty clone is skipped with a message naming
  `update <slug> --force`, and the branch-switch case is skipped with the same
  hint — `sync` never discards local work. Repair-with-discard is `update
  <slug> --force` (§5.4), which runs the full ownership + dirty + fetch sequence.
- Exit 0 iff every selected entry ends `present`; 1 otherwise (any skip or
  failure). Skips are reported per entry, never silently.

#### 6.3 Output vocabulary (sync)

`created <slug> <url> [@ <ref>]`, `updated <slug> [@ <ref> | branch <b>]`,
`ok <slug>`, `skipped <slug> <reason>`, `failed <slug> <op>: <msg>`.

`add`, `update`, and `sync` all print the **URL** on a materialization line, never
the derived clone path: the path is derived at read time and stays out of default
output (B001 §5, F18). `path=<derived>` appears only with `--verbose`, which adds
it to the same line without reordering anything (B003 §3). The one documented
path-carrying surface is the `reference_find` tool return (SPEC:65, B003 §8) —
a tool contract, never a CLI default.

#### 6.4 Ref-mismatch repair must not silently drop commits

Same rule as §5.4, minus the force option: a branch switch that would abandon
commits not on `origin/<default>` is **skipped** with the `update <slug> --force`
hint. `sync` is a repair verb, not a data-loss verb, and it has no flag that
changes that (F7).

### 7. Network policy per verb

| Verb | Contact remote by default? | Contact under a flag | Writes | Offline behaviour |
|---|---|---|---|---|
| `add` | yes — one `git clone` | none | clone + entry + scaffolding | fails on clone, rolls back (§3.6) |
| `update` | yes — `fetch` per §5.2 | none | clone or checkout/merge/reset inside the clone | fetch failure → refusal, HEAD untouched (§7.2) |
| `sync` | only to clone **missing** entries | none | clones only, plus `mkdir` of the root | present entries are repaired from local refs; unresolvable ref → skip with `update` hint |
| `status` | no | `--fetch` | nothing (read-only) | full report; `--fetch` is the only network path |
| `verify`, `verify --clones` | no | none | nothing | `--clones` is local-only (SPEC:60 CI-safe) |
| `doctor` | no | none | scaffolding + skills only (git only for `git add -f` of a recreated `.gitkeep`) | never network |

`status --fetch` contacts the remote **per entry in state `present` only**:
dirty, ref-mismatch, missing, and foreign entries are not fetched (their
freshness is meaningless or unknowable), which also means `--fetch` is cheap on a
broken tree. Fetch shape is the same policy as `update`: plain
`git -C <path> fetch --prune --quiet origin`, **never** `--force` on any fetch,
so a status fetch cannot move a pin or rewrite a local tag
(F4). A moved upstream tag is detected by the **tag-pinned** `lsRemote`
comparison through the §12 `resolveRemoteRef` helper — the same lookup §5.2 uses
— and reported (§9.2: `ref-mismatch` with `expected=`/`remote=`), never followed;
a commit-shaped pin is never queried, because a retag cannot move it (F24).

Plain `verify` reads committed store bytes and committed packaged-skill bytes
only — never installed skills, never git, never the network (B001 §11.3, F6).
`verify --clones` is local-git only.

#### 7.1 Never corrupt a clone

- Every git call is `execFile('git', [...])` with `-C <path>` (no `cd`, no
  shell), and that call lives **only inside `Git.Default`** in
  `src/modules/git/git.module.ts` — the `GitPort` layer (§12). Engines call port
  methods; no engine imports
  `node:child_process`, `execFile`, or spawns git by any other route (F20).
  Capture stdout and stderr; the first non-empty stderr line becomes the
  message suffix.
- Mutating operations run in a fixed order: ownership → dirty → fetch →
  resolve → checkout/merge → assert `HEAD`. A failure at any step stops before
  the next mutation.
- Fetch cannot corrupt a clone: verified with a broken origin —
  `git fetch` exited 128 with `Please make sure you have the correct access
  rights…`, and both `HEAD` and `git status --porcelain` were byte-identical
  before and after.
- `merge --ff-only` cannot half-apply: it either moves HEAD forward or aborts
  (verified: diverged → exit 128, HEAD unchanged).
- `checkout --detach <sha>` either moves HEAD or aborts; we only call it after
  the dirty check, and we assert `rev-parse HEAD` equals the target afterwards.
  If the assert fails (exotic state), report `failed: <slug> HEAD is <sha>,
  expected <sha>` without a second mutation.
- Clone safety is preflight + rollback (§3.1, §3.6).

#### 7.2 Failure reporting

| Failure | Line | Clone state afterwards |
|---|---|---|
| clone | `failed: clone <url> -> <path>: <msg>` | directory removed (§3.6) |
| fetch | `failed: fetch <slug>: <msg> (clone unchanged at <sha7>)` | unchanged |
| checkout | `failed: checkout <slug> @ <ref>: <msg> (HEAD <sha7>)` | git's abort state (HEAD unchanged) |
| ff | `refused: <slug> cannot fast-forward origin/<default> (ahead <n>, behind <n>); pass --force to reset` | unchanged |
| resolve ref | `refused: <slug> ref '<ref>' does not resolve in <url>; …` | unchanged |
| dirty (no fetch) | `refused: <slug> is dirty (<n> changed paths); …` | unchanged |
| ownership | `refused: <slug> … origin <actual>, expected <entry.url>; …` | unchanged |
| entry write | `failed: could not write …; clone removed` | removed |

All lines go to stdout (one stream; agents parse stdout, the exit code carries
success). Refusals set `process.exitCode = 1` **inside the handler** via the
shared `exitFailed` pattern (`.agents/documentation/author-mf-utility-cli.md:64`;
`A002/MEMORY.md:264-265`), and every message names the invocation form the reader
can type (`author-mf-utility-cli.md:71`).

### 8. Ref semantics in git terms

`ref` is B001's optional **string**; B002 consumes it and never extends the
schema. Absent or empty = default branch (dynamic target). Present = one of:

| `ref` value | Meaning | Clone-time state | `update` | `status` / `verify --clones` comparison |
|---|---|---|---|---|
| absent / `""` | remote default branch | clone leaves the default branch checked out, upstream set | fetch, then `merge --ff-only origin/<default>` after ensuring the branch is checked out | state `ref-mismatch` when HEAD is detached or on a branch other than `origin/HEAD`'s branch; otherwise `present`. Freshness only with `--fetch` (`behind`/`ahead`) |
| branch (`dev`) | that branch's **remote tip**, detached | clone (default branch), then resolve `refs/remotes/origin/dev` and `checkout --detach <sha>` | `fetch --prune --quiet origin`, re-resolve, re-checkout when the tip moved | `HEAD == resolveRef(ref)` (commit identity, not branch attachment) |
| tag (`v2.0.18`) | the tag's commit, detached | clone fetches tags; resolve `refs/tags/v2.0.18^{commit}`; `checkout --detach <sha>` | fetch **without `--force`**, re-resolve the local tag, compare the remote commit (§12 `resolveRemoteRef`: `^{}` row, else the plain row for a lightweight tag); a move is refused, never followed | `HEAD == resolveRef(ref)`; a local miss is `ref-mismatch` + `ref=<ref> unresolvable`, and under `--fetch` a moved upstream tag is `ref-mismatch` + `ref=<ref> expected=<sha7> remote=<sha7>` (§8.3) — `update` refuses the move, `status` only reports it |
| commit (`cd9a14a` or full 40-hex) — **the `opencode` pin** | that exact commit, detached | after clone, resolve; on miss fetch the SHA explicitly (no `+`); `checkout --detach <sha>` | fetch, resolve the recorded commit, checkout; unresolvable (unreachable from any ref on most servers) → refusal, pin untouched | `HEAD == resolveRef(ref)`; unresolvable commit → `ref-mismatch` with `unresolvable` detail and `ref-unresolvable` under `verify --clones` |

#### 8.1 Resolution precedence (one function, §2.6)

Commit-hex → tag → `origin/<ref>` → local branch → literal `refs/...`. Tags
beat branches so a pin cannot be hijacked by a same-named local branch, and
`origin/<ref>` beats `refs/heads/<ref>` so a stale local branch cannot satisfy a
pin.

#### 8.2 Checkout form (one form, everywhere)

Always resolve to a **full 40-hex SHA**, then:

```
git -C <path> -c advice.detachedHead=false checkout --detach <sha>
git -C <path> rev-parse HEAD          # assert equality
```

Detached is the contract: a pin is a commit, and `git branch --show-current`
returns empty (verified, 0 bytes) so an attached/detached mix cannot be mistaken
for a match. For no-ref entries the clone stays **attached** to its default
branch, because fast-forwarding requires a branch.

#### 8.3 Comparison rules (single source of truth, shared by `status` and `verify --clones`)

| Entry kind | `ref-mismatch` when | Detail token |
|---|---|---|
| pinned | `HEAD != resolveRef(ref)` | `head=<sha7> expected=<sha7>`; local ref unresolvable → `ref=<ref> unresolvable` |
| pinned, tag-shaped, `status --fetch` only | the remote tag's commit ≠ the local tag's commit (§9.2) | `ref=<ref> expected=<sha7> remote=<sha7>` — `expected=` is the local tag commit, `remote=` the commit the remote tag names |
| pinned, tag-shaped, `status --fetch` only | the remote reports no such tag (`resolveRemoteRef` → `undefined`) | `ref=<ref> unresolvable` |
| no ref | HEAD detached, or current branch != `origin/HEAD`'s branch | `detached expected=<default>` / `branch=<b> expected=<default>` |
| no ref, no `origin/HEAD` | current branch has no upstream | `no-upstream` |

Token widths are fixed (F25). `<sha7>` is **exactly 7 lowercase hex** — the
repo's abbreviated-commit form (B001:183) — so `head=`, `expected=`, and
`remote=` are all 7 chars, never 8. `head=` is the **observed** `HEAD`;
`expected=` is the commit the entry's `ref` resolves to locally (for a commit
pin, the first 7 chars of that same recorded ref; for the `--fetch` moved-tag
row, the local tag's commit); `remote=` is the commit the remote tag names, **as
`lsRemote` reported it**. `ref=` is the recorded `ref` value **verbatim and
never abbreviated**, so the `opencode` commit pin prints its full 40 hex and a
literal `refs/tags/v1` pin prints `refs/tags/v1`. The `--fetch` moved-tag row
prints exactly `ref=`, `expected=`, and `remote=` and **no** `head=`: its local
comparison is clean, so `HEAD` already equals the local tag commit and a `head=`
field would only duplicate `expected=` (F29). `verify --clones`' `[head]`
row follows the same split (B001 §7: `<sha7>` for HEAD, `<expected sha7>` for
the pin). Examples below are the byte-level contract C003/C004 test against.

`status` and `verify --clones` must call the same comparison function; the
difference is presentation and exit code (§9, §10), never the predicate.

This comparison is **local** — `HEAD` against the ref resolved in the clone — and
that is all `verify --clones` ever does, because it is CI-safe and offline
(SPEC:60). `status --fetch` layers **one additional, optional** predicate on top
of it, because it is the only reporting verb that reads a remote: for a
tag-shaped pin whose local comparison is clean, the remote tag's commit is
compared to the local tag's commit (§9.2), and a difference turns `present` into
`ref-mismatch` with the `remote=` detail above. That predicate never replaces
the local one (a local mismatch is already `ref-mismatch`), and `unresolvable`
stays reserved for `resolveRemoteRef === undefined`: a moved tag *does* resolve,
so it never prints `unresolvable` (F29). The *remote* copy of a tag-shaped pin is
resolved only where a remote is actually read: `update` (§5.2) and `status
--fetch` (§9.2) both pass their `lsRemote` rows to the one §12
`resolveRemoteRef` helper (F26). `verify --clones` never calls `lsRemote`.

#### 8.4 Ref changes are store edits

`update` never rewrites `ref`; moving a pin (e.g. to the next release's commit,
with the new tag recorded in the notes) is an edit to `REFERENCE.md` by the user
or a future `update --ref`. With no flag in SPEC:56 for that, the tool only prints
the fix-it hint naming the file (§5.6).

#### 8.5 Shallow / single-branch clones are tolerated, not created

The real `opencode` clone is shallow and single-branch (§1.2). Consequences:

- `status` does not add a state for it: HEAD identity and cleanliness still
  decide `present`/`dirty`/`ref-mismatch`.
- Offline resolution is limited to what was fetched: `origin/main` is
  unresolvable there (verified exit 1), while the pinned tag is present
  (verified `cd9a14a…`). A pinned entry therefore repairs offline via `sync`.
- `update` never converts a clone to shallow and never re-clones. When a needed
  ref is genuinely unfetchable because the refspec or shallow boundary is too
  narrow, the verbs **refuse** (`ref-unresolvable` / the §5.6 message) rather
  than rewrite history of a clone they did not create. `--force` cannot help:
  it discards local changes, it does not delete or rebuild a directory (F2).
- **Re-clone is two explicit verbs, never a flag:** `remove <slug>` (B003 §13.4 —
  removes the entry and, by default, a proven *clean* clone; a dirty clone needs
  `update <slug> --force` first or `--keep-clone` to keep it) followed by
  `sync <slug>`, which clones fresh. The human types both, so a full re-clone is
  always a decision, never a side effect. No verb contract recursively deletes an
  existing path; the only deletion of a directory is `remove`'s documented one and
  `add`'s rollback of a path it created in the same run (§3.6).

### 9. `status [name]` — decision

#### 9.1 Vocabulary (exact tokens, one line per entry, sorted by slug)

| Token | Meaning | Network |
|---|---|---|
| `missing` | `<path>` does not exist | no |
| `present` | proven clone, clean, HEAD matches the entry (pin commit, or default branch attachment) | no |
| `dirty` | proven clone, `status --porcelain` non-empty (detail `files=<n>`) | no |
| `ref-mismatch` | proven clone, clean, HEAD does not match (details §8.3) | no |
| `refused` | refusal line, not a state: foreign path / not-a-repo / unknown name / fetch failure | — |
| `behind=<n>` / `ahead=<n>` | modifiers appended to `present` **only with `--fetch`**, only when non-zero, **`behind` first then `ahead`** | yes |

State precedence for reporting one entry (first match wins):
`missing` → foreign refusal → `dirty` → `ref-mismatch` → `present`. (A dirty
clone can also be ref-mismatched; dirty is reported because it is the actionable
blocker for every repair verb.) `--fetch` adds exactly one edge: a locally
`present`, tag-pinned entry whose remote tag moved is reported `ref-mismatch`
(§8.3, §9.2) — the only state a remote value ever decides.

Examples (full rows — the literal is `<state> <slug> [<detail>…]`):

```
missing vitest
present pi-subagents
dirty vitest files=3
ref-mismatch opencode head=23e3493 expected=cd9a14a
ref-mismatch effect branch=dev expected=main
ref-mismatch opencode ref=cd9a14a6b688d4021bee381dfd39d2cef9c0f862 unresolvable
ref-mismatch svelte ref=v1 expected=cd9a14a remote=7c1f0ab
present effect behind=3
present pi-subagents behind=1 ahead=2
```

Summary line, always last:

```
summary total=<n> missing=<n> present=<n> dirty=<n> ref-mismatch=<n> foreign=<n>
```

#### 9.2 Offline vs `--fetch`

- Without `--fetch`, `status` is fully offline: it reads the filesystem, git
  config, local refs, and the index. It reports `missing`, `present`, `dirty`,
  `ref-mismatch` truthfully for that moment.
- `--fetch` adds two things: `behind`/`ahead` for entries that are `present`
  (`GitPort.counts`, i.e. `git -C path rev-list --left-right --count
  HEAD...refs/remotes/origin/<default>` → `ahead<TAB>behind`; the same counts
  `update` uses in §5.2), and moved-pin detection through `GitPort.lsRemote`
  (`lsRemote(path, ['refs/tags/<name>', 'refs/tags/<name>^{}'])` — `<name>` is
  the normalized tag name from §2.6, so a literal `refs/tags/v1` pin queries
  `refs/tags/v1` / `refs/tags/v1^{}`, with the prefix applied once to `<name>` — fed to
  the same §12 `resolveRemoteRef(rows, <name>)` helper — one lookup, never an
  array index by ref string — and the same comparison as §5.2): a **tag-pinned**
  entry whose remote commit differs from the local tag commit is `ref-mismatch`
  with detail `ref=<ref> expected=<sha7> remote=<sha7>` (`expected=` the local tag
  commit, `remote=` the commit the remote reports, both 7 chars, §8.3). The row
  carries no `head=` field: the move is visible as `expected=` (local) versus
  `remote=` (upstream), and `HEAD` still equals the local tag commit.
  `ref=<ref> unresolvable` is reserved for `resolveRemoteRef === undefined` — the
  remote reports no such tag at all — and is never printed for a move, because a
  moved tag does resolve (F29). A commit-shaped pin is never queried (F24), so a
  retag cannot change its state. The fetch itself is never
  forced (F4),
  and `status` reaches git only through the port — no `execFile` in the engine
  (F20). No other entry state is fetched.
- `--fetch` never mutates the worktree; it only updates remote-tracking refs and
  **new** tags (`fetch --prune`, no `--force`), so it cannot rewrite a tag a pin
  relies on. It is therefore safe to run at any time, and it can never turn
  `present` into `dirty`.
- A fetch failure under `--fetch` is a **refusal**: print the last-known state
  line, then `failed <slug> fetch: <msg>`, exit 1. Reporting 0 would claim
  freshness that was never established.

#### 9.3 Exit-code rule (SPEC:58)

- `status` (and `status --fetch`) exits **0** whenever every selected entry was
  *reported* — including `missing`, `dirty`, and `ref-mismatch`. Status is a
  report, not a gate; a fresh checkout printing 14 × `missing` is success.
- It exits **1 only on a refusal**: unknown name, foreign path / not-a-repo, or
  a `--fetch` network failure. Refusals are exactly the cases where the tool
  declines to answer, which is the SPEC:58 wording.
- The CI gate is `verify --clones`, not `status`; that separation is why status
  can stay 0 on a broken local state.

#### 9.4 Read-only

`status` never writes: no store, no clone, no scaffolding, no lock. `--fetch`
writes only git's remote-tracking refs/tags inside the clone, never the
worktree or the index.

### 10. Verb × entry-state matrix

States (from §9.1, plus the add-only case):

- **U** = unregistered URL (no entry, no path)
- **M** = `missing` (entry exists, path absent)
- **P** = `present`
- **D** = `dirty`
- **R** = `ref-mismatch`
- **F** = `foreign` (path exists: not a git work tree, symlink, or origin ≠ entry URL)

| Verb | U | M | P | D | R | F |
|---|---|---|---|---|---|---|
| `add <url>` | validate → clone → write entry ⇒ **P** (refusal on slug collision / orphan path / clone failure stays **U**) | routes to `update` (§4.2) | routes to `update` | routes to `update` | routes to `update` | routes to `update`; update refuses, stays **F** |
| `update <name>` | n/a (add-it-first refusal) | clone + pin checkout ⇒ **P**; clone failure stays **M** | fetch; no-op or `--ff-only` ⇒ **P**; diverged/ahead refuse ⇒ **P** (force ⇒ **P** via reset) | refuse (early, no fetch) ⇒ **D**; `--force` ⇒ **P** | fetch; checkout/reset ⇒ **P**; unresolvable ref refuse ⇒ **R** | refuse ⇒ **F** |
| `sync <name>` / `--all` | n/a | clone (+ pin, no fetch) ⇒ **P**; clone failure stays **M** | no network, no-op ⇒ **P** | skip ⇒ **D** with the `update <slug> --force` hint; no force flag exists (F7) | local checkout ⇒ **P**; unresolvable ref or unique commits ⇒ skip with `update` hint, stays **R** | skip; never delete or force ⇒ **F** |
| `status [name]` | n/a | report `missing` ⇒ 0 | report `present` ⇒ 0 | report `dirty` ⇒ 0 | report `ref-mismatch` ⇒ 0 | refusal line ⇒ 1; state not reported |
| `status --fetch` | n/a | `missing` ⇒ 0 (no fetch) | fetch ⇒ `present [behind=<n>] [ahead=<n>]` ⇒ 0 — **except** a tag pin whose remote tag moved ⇒ `ref-mismatch` + `ref=<ref> expected=<sha7> remote=<sha7>` ⇒ 0; fetch failure ⇒ refusal 1 | `dirty` ⇒ 0 (no fetch) | local `ref-mismatch` ⇒ reported as-is ⇒ 0 (no remote lookup — HEAD already disagrees); remote tag gone on a clean tag pin ⇒ `ref-mismatch` + `ref=<ref> unresolvable` ⇒ 0 | refusal ⇒ 1 |
| `verify --clones` | n/a | `clone-missing` ⇒ 1 | clean ⇒ 0 | `clone-dirty` ⇒ 1 | `clone-head` or `ref-unresolvable` ⇒ 1 | `clone-origin`, or `clone-not-git`/`clone-path` for not-a-repo/symlink ⇒ 1 |
| `verify` (no `--clones`) | n/a | ignored (no git) ⇒ 0 | ignored ⇒ 0 | ignored ⇒ 0 | ignored ⇒ 0 | ignored ⇒ 0 |
| `doctor` / `doctor --check` | scaffolding only, no clone access | same | same | same | same | same |

Resulting-state summary: the only verbs that change clone state are `add`
(creates ⇒ P) and `update` (M/D/R ⇒ P, or refuses). `sync` changes **M** and
**R** to **P** and never touches **D** (it skips); `status`, `verify`, and
`doctor` never change clone state. `status --fetch` can move an entry's
*reported* state from P to R through the remote-tag predicate (§8.3), but the
clone itself is untouched — the fetch is unforced, so the pin stays put.

`verify --clones` issues use the B001 §7 clone-scope classes verbatim (SPEC:60 —
the entry is named in the block header by its **store-relative path**, the field
in the line). Rendered in agent default, exactly as B001 §7's shape statement
says (F21); the four blocks below are four different entries, which is why each
state is provable on its own:

```
error .agents/@montflow/references/opencode/REFERENCE.md has 2 issues. Fix each one and run verify again.

1. [head] Clone HEAD 23e3493 does not match ref 'cd9a14a6b688d4021bee381dfd39d2cef9c0f862' (cd9a14a).
2. [origin] Clone origin 'https://github.com/fork/opencode.git' does not match 'https://github.com/sst/opencode.git'.

error .agents/@montflow/references/vitest/REFERENCE.md has 1 issue. Fix each one and run verify again.

1. [path] Clone is missing; run 'mf-references sync vitest'.

error .agents/@montflow/references/sveltekit/REFERENCE.md has 1 issue. Fix each one and run verify again.

1. [dirty] Clone has 3 changed paths.

error .agents/@montflow/references/vendor/REFERENCE.md has 1 issue. Fix each one and run verify again.

1. [git] Not a git work tree.
```

Class ids in the same order: `clone-head`, `clone-origin`, `clone-missing`,
`clone-dirty`, `clone-not-git`; `clone-path` covers a file/symlink at the path,
`ref-unresolvable` covers an unresolvable pin (field `ref`).

- `<path>` is the store-relative entry path, never the clone path and never a bare
  `.opencode/REFERENCE.md`-style abbreviation (B001 §7 attribution rule).
- `[head]` carries the entry's **full** `ref` value inside the quotes — B001:379's
  template interpolates `<ref>` verbatim, so an abbreviated commit in that slot is
  a bug in any fixture.
- `clone-missing`, `clone-path`, and `clone-not-git` are mutually exclusive with
  `clone-dirty`/`clone-head`/`clone-origin` for the same entry: a path that is
  absent or not a work tree has no index to count and no `HEAD` to compare. A
  fixture that pairs them (the block this replaces did) describes a state a
  correct probe cannot produce.
- `--human` swaps the header and warning tokens for `✗`/`⚠` (B001 §7, B003 §3);
  everything else in the block is identical.

### 11. Output and exit contract (summary for C003/C004)

| Verb | Exit 0 when | Exit 1 when |
|---|---|---|
| `add` | entry written (or routed `update` succeeded) | any refusal, clone/checkout/write failure |
| `update` | entry ends `present` (including up-to-date no-op) | dirty/diverged/ahead/foreign/unresolvable refusal, fetch/checkout failure |
| `sync` | every selected entry ends `present` | any skip (dirty/foreign/unresolvable) or failure |
| `status` | every entry reported as a state | unknown name, foreign, `--fetch` failure |
| `verify --clones` | no issues | any issue |

Line grammar: `<token> <slug> [<detail>…]`, tokens `created`, `updated`,
`present`, `missing`, `dirty`, `ref-mismatch`, `routed`, `skipped`, `failed`,
`refused`, `ok`, `summary`. No colour, no box drawing, no progress spinners, and
**no glyphs** in the default path (F17 — glyphs exist only in `--human` output,
B003 §3); `--human` renders tables from the same data, `--verbose` adds `path`,
`origin`, `head`, `upstream`. Entries are processed in slug order, sequentially,
so two runs produce byte-identical output.

The derived clone path is **not** in any default line (B001 §5, F18): it is a
`--verbose` field (`path=<derived>`) and, separately, the documented
`reference_find` tool return (SPEC:65, B003 §8). No CLI verb inherits the tool
exception.

**Normative single-line results (F13 — B003 §3 cites these literals verbatim):**

- `add` success prints **exactly one** line: `created <slug> <url>`, exit 0.
  There is no trailing `present <slug>` state line; state is `status`'s job.
- `add` routed prints the notice line
  `routed add -> update <slug>: <url> is already registered as <slug>` and then
  update's own result line(s) (`present <slug>`, `updated <slug> head=<sha7>`,
  `created <slug> <url>`, or a `refused:`/`failed:` line); exit is update's.
- `status` row when in sync and clean: `present <slug>` — nothing else. With
  `--fetch`, `behind=<n>` is appended first and `ahead=<n>` second, each only
  when non-zero: `present <slug> behind=1 ahead=2`. Never `ahead` before
  `behind`.
- `update` no-op: `present <slug>`; a real move: `updated <slug> head=<sha7>`;
  materialization: `created <slug> <url> [@ <ref>]`.
- `sync` per entry: `created` / `updated` / `ok` / `skipped` / `failed` on the
  same grammar (§6.3), with the same `<url>` (never `<path>`) for `created`.

### 12. Implementation seam and fixtures for C003

- One **`src/modules/git/`** module — `git.module.ts` plus the `index.ts`
  re-export barrel — which is the home SPEC:51 and C001 `TASK.md:26` assign the
  git lifecycle (`src/modules` holds the reference entity, verifier, and git
  lifecycle; `src/services` holds only `reference-store`). It is an Effect
  service (`Context.Service`, `execFile`, no shell — content precedent
  `packages/reviews/src/services/profile-probe/profile-probe.services.module.ts:3,28-50`,
  itself a service module under a `src/services` group, which is why only its
  *body* is copied here, not its folder) exposing a **`GitPort` seam**: `isRepo`,
  `origin`, `isShallow`, `isDirty`,
  `head`, `resolveRef`, `defaultBranch`, `counts`, `clone`, `fetch`, `lsRemote`,
  `checkoutDetached`, `checkoutBranch`, `fastForward`, `resetHard`, `clean`,
  `addForce`.
  Engines depend on the `GitPort` service (never on `node:child_process`
  directly); `Git.Default` is the `execFile` layer **declared in the same module
  file** (`git.module.ts`) and wired where the package's other module layers are
  wired — the modules group needs no separate service file, so `src/services`
  stays the single `reference-store` entry SPEC:51 names. Tests provide a fake
  or recording port. Renderers stay pure (`author-mf-utility-cli.md:64-65`).
  Ownership across tasks is split explicitly (F23, F27): **C001 creates**
  `src/modules/git/` and its `index.ts` barrel with the rest of the
  `src/modules` barrels (`C001 TASK.md:26`); **C003 fills** `git.module.ts` with
  the port, `Git.Default`, and the **module operations** — the §2 primitives and
  the git-side command sequences §3–§6 depend on (fetch without `--force`,
  explicit-refspec repair, resolve, detached checkout, `assert HEAD`, the §5.2
  guard lookup). C003 does **not** implement the CLI engines: the one engine set
  — `add`, `update`, `updateAll`, `sync`, `status` — lives in
  `src/apps/cli/engines.apps.module.ts` with its tests in
  `src/apps/cli/tests/engines.test.ts`, and **C004** owns it (B003 §5, §14).
  `git.module.ts` therefore exposes `GitPort` and nothing verb-shaped; that is
  the single home, and C003 `TASK.md:19,23-26`'s "implement add/update/sync/
  status" is read as "supply the git operations those engines call" — recorded
  here because phase B cannot edit the C003 TASK. No git group is created under
  `src/services`, and this supersedes A002 §8:519's git-under-services proposal —
  A002 is exploratory, while SPEC:51 and C001 `TASK.md:26` are normative for the
  tree.
  - `lsRemote(path, patterns): ReadonlyArray<{ ref: string; sha: string }>` —
    `git -C <path> ls-remote --quiet origin <patterns…>`, one pair per matching
    line, **verbatim**: a peeled line keeps its `^{}` suffix in `ref`
    (`{ ref: 'refs/tags/v1^{}', sha: '<40-hex>' }`), and a pattern that matches
    nothing is absent rather than an error. Empty array = no match; non-zero
    exit = refusal with stderr's first line. It is the package's **only**
    remote-ref query: §5.2's moved-tag guard, §9.2's `--fetch` moved-pin
    detection, and the fixture below all call it, and none may shell out
    directly (F20).
  - **`resolveRemoteRef(rows, ref): string | undefined`** — the one lookup from
    those rows to the **commit** a tag-shaped `ref` names. Defined once here and
    called by both consumers, never re-implemented in an engine and never
    indexed by ref string (F26):
    ```
    resolveRemoteRef(rows, ref):
      rows.find(p => p.ref === `refs/tags/${ref}^{}`)?.sha      # annotated: peeled commit
      ?? rows.find(p => p.ref === `refs/tags/${ref}`)?.sha       # lightweight: the tag's own sha
      ?? rows.find(p => p.ref === `refs/heads/${ref}`)?.sha      # branch-shaped ref
      ?? rows.find(p => p.ref === `refs/remotes/origin/${ref}`)?.sha   # branch-shaped ref, remote-tracking
      # no matching row -> undefined
    ```
    The order is normative. `git ls-remote` emits **no** `^{}` line for a
    lightweight tag, so its plain row is **authoritative** and its sha *is* the
    commit (git 2.55.0: `git tag v1` → exactly one row, `refs/tags/v1`); an
    annotated tag emits both rows, the `^{}` row being the peeled commit and the
    plain row the tag object, so the peeled row is tried first (git 2.55.0:
    `refs/tags/v2` + `refs/tags/v2^{}`). Both shapes compare against
    `resolveRef(path, 'refs/tags/<name>')`, which already peels via `^{commit}`.
    **The argument is the normalized tag name, not the raw `ref` value (F31):**
    §2.6's `tagName` strips one leading `refs/tags/`, so a `refs/tags/v1` pin
    queries `refs/tags/v1` / `refs/tags/v1^{}` and passes `v1` here. The prefix
    is therefore applied exactly once, to the normalized name; a re-prefixed
    pattern is no match at all (verified, git 2.55.0: `refs/tags/v1` prints the
    tag's row, a double-prefixed pattern prints nothing) and would turn an
    accepted spelling into a false `unresolvable`.
    `undefined` means the remote did not report the ref at all; §5.2 refuses it
    with the §5.6 **unresolvable** message (never moved-pin, which would quote a
    sha that was never read) and §9.2 reports `ref=<ref> unresolvable`.
    `verify --clones` does **not** call this: it is local-only by SPEC:60, so it
    compares `HEAD` to the locally resolved ref (§8.3) and performs no remote
    lookup.
  - `addForce(path, paths)` — `git -C <path> add -f -- <paths…>`, the `.gitkeep`
    staging call in §3.4 and in `doctor` (B003 §7). It is on the port for the
    same reason: `add` and `doctor` are engines, and no engine calls `execFile`.
- **Hermetic `add` test through the seam (F5).** The https-only rule is an
  argument predicate (§2.1), not a property of the git call. The test builds a
  temp **workspace root with `git init <root>`** — §3.1 step 0 requires a work
  tree — plus a separate temp repository, provides a `GitPort` whose
  `clone(url, path)` ignores the URL string and clones the temp path (recording
  the URL it received), then runs
  `add https://example.test/fixture.git --purpose 'Fixture repo for the add
  engine.'`. The whole add path — preflight, clone, ref checkout, entry write,
  rollback — executes with no network and no policy hole, and the port's recorded
  URL proves the engine passed the https argument through untouched. A companion
  case points the same engine at a temp directory that is **not** a git work
  tree: `add` refuses with the step-0 message, the port records **zero** `clone`
  calls, and no `.agents/` tree is created (F30). A separate
  pure unit test asserts `add` refuses ssh, scp-style, `file://`, and local-path
  arguments **before the port is called** (spy asserts zero calls). `status`/`update`/`sync`
  fixtures clone a temp path directly, exactly as before; no network is needed
  anywhere.
- Fixture expectations that must hold (real cases from §1.2, copied into a temp
  root):
  1. `opencode` entry with `ref: cd9a14a6b688d4021bee381dfd39d2cef9c0f862`
     (**commit pin**), clone on `dev` at `23e3493` ⇒
     `status` = `ref-mismatch opencode head=23e3493 expected=cd9a14a`;
     `verify --clones` = `clone-head` issue, exit 1; `sync opencode` = offline
     `checkout --detach cd9a14a` ⇒ `present`; `update opencode` = fetch (no
     `--force`), resolve the recorded commit, same checkout ⇒ `present`. With
     the upstream tag `v2.0.18` moved, `update` = **`present`** and HEAD
     unchanged: the recorded ref is commit-shaped, so §5.2's guard is skipped and
     the recording port proves **no** `lsRemote` call was made (F24) — a retag
     cannot move a commit.
  2. `svelte` entry — a separate temp entry with `ref: v1` (**tag-shaped**, the
     `add --ref v1` shape, not `opencode`) — clone pinned at `v1`'s commit. Both
     tag kinds are exercised against the **recording port**, with the real
     `ls-remote` row shapes git emits (F26):
     - **lightweight** `v1` (`git tag v1`): `lsRemote(path, ['refs/tags/v1',
       'refs/tags/v1^{}'])` returns **one** row, `[{ ref: 'refs/tags/v1', sha:
       '<commit>' }]`; the plain row is authoritative — no `^{}` row exists.
       Unmoved ⇒ `resolveRemoteRef` returns that commit = the local tag commit ⇒
       `update` = `present`, HEAD unchanged.
     - **annotated** `v2` (`git tag -a v2 -m …`): the same call returns **two**
       rows, `[{ ref: 'refs/tags/v2', sha: '<tag object>' }, { ref:
       'refs/tags/v2^{}', sha: '<commit>' }]`; `resolveRemoteRef` takes the
       `^{}` row, never the tag-object sha. Unmoved ⇒ `present`.
     - **moved upstream**, either kind: the port returns the *new* sha in the row
       `resolveRemoteRef` reads, `update` = the §5.6 moved-pin refusal with HEAD
       unchanged, and the recorded `lsRemote` call proves the guard ran. For the
       lightweight tag that row is the plain `refs/tags/v1` one — the fixture must
       **not** invent a `refs/tags/v1^{}` row to make the guard fire, because
       `git tag v1` never produces one.
     - **tag deleted upstream**: `lsRemote` returns `[]` ⇒ `resolveRemoteRef` is
       `undefined` ⇒ §5.6 **unresolvable** refusal, not moved-pin.
     - **literal `refs/tags/v1` pin** — the same entry written with the literal
       refname: `refShape` = `tag`, `tagName` = `v1`, so the guard queries
       `refs/tags/v1` / `refs/tags/v1^{}` and compares the same two commits as the
       bare `v1` pin. The recorded `lsRemote` call asserts the patterns carry a
       **single** `refs/tags/` prefix, i.e. the normalized name (F31), and the
       unmoved/moved/deleted outcomes are identical to the bare-name case — one
       pin, two spellings.
     `status --fetch` on the same clone runs the identical comparison through the
     same helper (§9.2): `present` when unmoved; `ref-mismatch svelte ref=v1
     expected=<local tag sha7> remote=<new upstream sha7>` when the tag moved —
     never `unresolvable`, which is reserved for the empty-row case; and
     `ref-mismatch svelte ref=v1 unresolvable` after the upstream delete.
     `verify --clones` stays local-only (SPEC:60) and reports from the local tag
     commit. No network, and no second git path (F20).
  3. `pi-subagents` entry, no ref, clone clean on `main` ⇒ `present`; after
     `echo x >> README.md` ⇒ `dirty files=1`; `update` refuses, `update --force`
     ⇒ `present`.
  4. Fresh root with only `.gitkeep` ⇒ 14 × `missing`, `status` exits 0,
     `verify` (no `--clones`) clean, `sync --all` clones (network) and pins
     `opencode`.
- Determinism: never call git with `-c color.*`; set `LC_ALL=C` in the child env
  so stderr text used in messages is stable across locales.

## Open Questions

1. **`add --ref` flag ownership — CLOSED.** B002 fixes the engine semantics
   (§3.3); B003 §2.7 exposes `--ref <branch|tag|commit>` and `--purpose <text>`.
   Pinned entries are therefore creatable without hand-editing `REFERENCE.md`.
2. **`remove` semantics — owned by B003 §13.4.** No B002 requirement covers it,
   so this record only fixes the interaction: `remove <name>` deletes the entry
   and, by default, a **proven clean** clone; `--keep-clone` keeps it; a dirty or
   foreign clone is refused without `--keep-clone`; there is no `--force`. A
   re-clone is that `remove` followed by `sync` (§8.5) — no verb deletes a
   directory as a side effect.
3. **`update` has no `--offline`.** As decided, `update` always fetches and
   refuses on network failure. Offline repair is `sync`, which is documented as
   the offline verb (§6.2, §7). If the reviewer wants a single verb for both,
   that is a SPEC change (new flag), not a C003 decision.
4. **Shallow/foreign clones and re-cloning — CLOSED (F2).** A narrow/shallow
   clone is tolerated (§8.5); `--force` only discards local changes
   (`checkout -f` / `reset --hard` / `clean -fd`, never `-x`) and never deletes or
   rebuilds a directory. A rebuild is the explicit `remove <slug>` + `sync
   <slug>` pair, so the destructive step is always a human decision. Nothing in
   the verb contract recursively deletes an existing path.
5. **B001 has signed off — CLOSED.** B001's `MEMORY.md` exists and this record
   consumes it: `ref` stays one opaque string (B001 §3, now pinned to a full
   commit for `opencode`), the clone path stays derived (B001 §5), and B003
   exposes `--ref` (§2.7), so §3.3 is live code.

## Handoff

- **B003 (CLI/tools):** take the flag set from §3.5 (`--name`, `--purpose`,
  `--ref`), the https-only argument policy (§2.1 — no ssh/scp/`file://`/path is
  ever accepted), the routing notice (§4.2), the refusal messages (§4.3, §4.4,
  §5.4, §5.6), the usage errors (§6.1), the exit table (§11), and the normative
  output literals (§11: one `created <slug> <url>` line, the same `<url>` on
  `update`/`sync` materialization, `path=` only under `--verbose`; `behind=`
  before `ahead=`) — B003 §3 must cite them verbatim. There is **no force flag
  on `sync`** (§6.2, F7) and **no re-clone flag** (§8.5, F2).
  `--human`/`--verbose` render the same line data; **no glyphs in agent default**
  (F17). Slash and binary share the engines
  (`author-mf-utility-cli.md:69`); thread `invocation` into every refusal
  (`:71`).
- **C003 (implement-git-lifecycle):** fill `src/modules/git/git.module.ts` — the
  folder and barrel are C001's (`C001 TASK.md:26`); do **not** add a git group
  under `src/services` (F23, §12). Implement §2 primitives and the git-side
  operations §3–§6 need — fetch without `--force`, explicit-refspec repair,
  resolve, detached checkout, `assert HEAD`, the §5.2 guard
  (`refShape`/`tagName`/`resolveRemoteRef`) —
  as `GitPort` methods, with module tests. Do **not** write the `add` / `update` /
  `sync` / `status` engines, the §2 flag set, or the parser: B003 §5 and §14 give
  that one engine set, and B003:182 gives §1–§6's flags and usage checks, to
  `src/apps/cli/engines.apps.module.ts` under **C004** (§12), and C003
  `TASK.md:19,23-26` is read as "supply the git operations those engines call"
  (F27, F28). Every git call goes through `GitPort` and nothing else does:
  `lsRemote` for the tag-shaped moved-pin guard only (§5.2 — a commit pin never
  calls it, F24), `status --fetch` (§9.2), and the §12 fixture, `addForce` for
  `.gitkeep` staging (F20). Never `execFile` in an
  engine. Every command string here is the command to run — no
  reinterpretation — **except the surface (flags, output literals), where B003
  §2.5/§3 wins**. §3.1's step order is firm for the engine C004 writes — validate
  the URL and the passed fields, route, require `--purpose` for a new URL, and
  only then preflight, scaffold, clone, and write (F19), so a refusal never
  clones or leaves scaffolding — and the git module supplies the calls, not the
  order. Assert `HEAD` after every mutating step; never `sh -c`; never
  `--force` on a fetch; capture stderr's first line; process entries sequentially
  in slug order. C003's acceptance set is the `GitPort`/`lsRemote` contract and
  the tag-row cases in §12, tested at module level; §12's verb-level scenarios
  are C004's engine tests (B003 §5).
- **C002 (registry+verify):** `verify --clones` reuses the §8.3 comparison and
  emits exactly B001 §7's clone-scope classes (`clone-missing`, `clone-path`,
  `clone-not-git`, `clone-origin`, `clone-dirty`, `clone-head`,
  `ref-unresolvable`) with fields `path`, `git`, `origin`, `dirty`, `head`,
  `ref`; plain `verify` reads committed store + packaged-skill bytes only and
  must not shell out to git or read installed skills (A003 §5 boundary, B001
  §11.3, F6).
- **C006 (skills/doctor):** the find skill's "offer to sync a missing entry"
  maps to `sync <name>`; the add skill must treat `routed add -> update <slug>:
  …` as a **notice, not success** — success requires a following
  `present`/`created`/`updated` line and exit 0, and any `refused:`/`failed:`
  line or exit 1 must be surfaced (F11, B003 §11). It must never hand-edit
  `REFERENCE.md` (SPEC:65).
- **Reviewer of this planning task must judge:** (a) every TASK:25-33 bullet is
  answered with a decision, not a menu — add/routing/update/sync/status/network/
  ref/ownership/matrix are all covered; (b) each git claim is backed by an
  observed transcript in §2/§5/§8; (c) the matrix has an action and a resulting
  state for every verb × state cell; (d) no schema element was redefined and
  `ref` is consumed as B001's string; (e) nothing outside this `MEMORY.md` was
  written.
- **Mechanical check:** `bun run --cwd packages/specs cli check --dir "$PWD"`
  was run from the repo root after writing this file; result recorded in the
  receipt (expect `N specs · 0 failed · 0 issues`).
- **No `BOARD.md`/`MAILBOX.md` exists** for this spec; the profile's broadcast
  steps could not be performed (see Deviations).

## Deviations

- **Only this `MEMORY.md` was written.** No spec state, lock, ledger, gate,
  product, skill, doc, or other task file touched.
- **No `BOARD.md` broadcast and no `MAILBOX.md` note.** The spec directory
  contains no `BOARD.md`, `MAILBOX.md`, or `PHASE.md` (verified by `ls` of the
  spec root and of this task dir), and PROFILE/TASK both restrict writes to this
  file. Handoff is the section above.
- **No `GATES.md` and no mechanical gate for the task itself.** SPEC line 84
  marks B002 `Gates: No`; the only machine check run is the spec-structure check
  named in the receipt.
- **Sibling-worktree reads were non-mutating.** `git rev-parse`, `status`,
  `symbolic-ref`, `branch`, `tag`, `cat-file`, `config --get`,
  `rev-parse --is-shallow-repository` only. No checkout/fetch/clone ran there;
  the only writes were throwaway experiments under `/tmp/opencode/gitexp/`.
- **No network fetch of the real fixtures.** `update`/`status --fetch` behaviour
  against GitHub was not exercised (out of scope, and it would move a clone this
  task may not touch). The pin resolves locally, which is the fact C003 needs.
- **B001 dependency is resolved.** B001's `MEMORY.md` landed after this record
  was drafted; round 001 (F1–F16) reconciled this file with it — https-only
  `url`, full-commit `opencode` pin, B001 §7 clone-scope class names, verify's
  committed-bytes-only scope. Read the Context bullet above, not this note, for
  the current binding.
