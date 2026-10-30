# Memory

## Context

C004 adds the mechanical answer to "which spec am I working on?": the pure
resolver (branch grammar + matching), the `mf-specs which` verb, the `/specs
which` slash form, and the workspace/git detection that feeds both. `execute`
(C003) calls the same exported resolver instead of a copy.

Out of scope and untouched: the `execute` command and the host `spec_execute`
tool (C003), `packages/specs/README.md`, skills, prompts, profiles, fixtures,
and every other task directory.

Conventions followed: `modules/<name>/<name>.module.ts` + `index.ts` +
`CONTEXT.md` + colocated `tests/*.test.ts` with `@effect/vitest` namespace
imports; `export *` in the module index and `export * as Which` in
`modules/index.ts`; CLI diagnostics built through `diagnostic()` /
`SizingDiagnostic` with `code`/`path`/`field`/`problem`/`expected`/`actual`/
`fix`/`next`; `Data.TaggedError` via the existing `SurfaceError`; Effect v4
`FileSystem` service (no `node:` imports).

## Progress

Done. Files added:

- `packages/specs/src/modules/which/which.module.ts`
- `packages/specs/src/modules/which/index.ts`
- `packages/specs/src/modules/which/CONTEXT.md`
- `packages/specs/src/modules/which/tests/resolve.test.ts`
- `packages/specs/src/apps/cli/tests/which.test.ts`

Files modified:

- `packages/specs/src/apps/cli/cli.apps.module.ts` — the `which` engine
  (`which`, `renderWhich`, `WhichOptions`, `workspaceOf`, `detectBranch`,
  `specNames`, `whichDiagnostic`, `whichCommand`), `FileSystem` in
  `runSlash`'s environment, and `which`/`--branch` in the slash parser.
- `packages/specs/src/apps/cli/CONTEXT.md` — the verb, its failure contract,
  the slash form, and `renderWhich` in the belongs-here list.
- `packages/specs/src/apps/cli/tests/helpers.ts` — `stubLayer` now merges
  `NodeFileSystem.layer`, so `runSlash`'s new `FileSystem` requirement is
  satisfied by every CLI test without touching each call site.
- `packages/specs/src/apps/cli/tests/run-slash.test.ts` — `/specs which`
  success and diagnostic cases.
- `packages/specs/src/modules/index.ts` — `export * as Which`.
- `packages/specs/src/server.ts` — `which` in `COMMAND_DESCRIPTION`; the
  slash layer now also provides `NodeFileSystem`.
- `.agents/@montflow/specs/spec-optimizations/C004-spec-detection/MEMORY.md`
  (this file).

Behaviour landed:

- `Which.resolve({ source, names })` is the single matching rule: exact
  normalized name first, otherwise a unique prefix pair in either direction,
  otherwise a coded miss. No fuzzy, edit-distance, keyword, or description
  matching.
- `Which.parseBranch` accepts only the eleven lowercase conventional prefixes
  and normalizes the feature with `/` and `_` → `-`, lowercased.
- `Which.parseHead` reads `ref: refs/heads/<branch>`; a bare SHA, a tag ref, or
  an empty `HEAD` is no branch (`detached` / `unreadable-head`).
- `Which.parseGitFile` reads `gitdir: <path>` and resolves a relative path
  against the workspace, covering the worktree `.git`-file form.
- `which(root, { branch?, workspace? })` verifies the specs root, lists only
  directories that hold a `SPEC.md`, reads git metadata when `--branch` is
  absent, and returns `WhichMatch { name, branch, feature }`. Every failure is
  one `SurfaceError` diagnostic with `code` `SPEC_NO_MATCH`/`SPEC_AMBIGUOUS`,
  `path` = the specs root searched, `field branch`, the branch read, the
  candidate list, the exact `--name` values, and `next ask the user`.
- CLI exit `1` for those failures (through `diagnoseCause` /
  `VALIDATION_EXIT_CODE`); success prints exactly one name and nothing else.
- `--dir` keeps the package-wide meaning: workspace root, so the specs root is
  `<dir>/.agents/@montflow/specs` and git metadata is `<dir>/.git`. This is
  what makes the TASK completion command work with `--dir "$PWD"`.

## Findings

- The repo is checked out as a worktree: `.git` is a file containing
  `gitdir: /home/daniel/dev/montflow/.bare/worktrees/spec-optimizations`. The
  resolver therefore reads the git directory from the file, not `HEAD` from
  the workspace.
- `FileSystem.FileSystem` had to become an explicit requirement of the `which`
  effect: the `SpecStore` service exposes only specs-root reads, and adding a
  git read there would have crossed into `services/spec-store` (out of this
  task's ownership). `runSlash` inherits the requirement, so `server.ts`
  merges `NodeFileSystem.layer` into its slash layer and the CLI test helper
  does the same.
- `store.names` already returns directories only, but it cannot tell whether
  one holds a `SPEC.md`; the resolver snapshots each candidate once and keeps
  only those with `SPEC.md`. A spec-less directory is never a candidate.
- Candidate semantics: for `SPEC_NO_MATCH`, a detached HEAD, a missing `.git`,
  or an unreadable `HEAD`, the candidate list is every spec (any `--name`
  works); for `SPEC_AMBIGUOUS` it is only the colliding names, so the `fix`
  names exactly the values that resolve the ambiguity.
- `parseHead` calls a tag ref `detached`: git would say "no branch", and
  SPEC line 83 folds every non-branch checkout into the no-match path. The
  problem line names the ref; the actual line says `detached`.
- Effect v4 `Effect.matchEffect` is the existing idiom for optional reads
  (`hasRoot`/`exists` in `SpecStore`); `readFileOrNone` reuses it so an absent
  or unreadable `.git`/`HEAD` never becomes a defect.

## Open Questions

- None blocking.
- Completion item "`execute` and the host tool reuse the same resolver" is a
  forward contract: C003 owns `execute`/`spec_execute`, which do not exist
  yet. C004 exposes one resolver and no second copy; C003 must call
  `Cli.which` (or `Which.resolve`) rather than re-implement detection.
- A tag ref (`ref: refs/tags/...`) and a detached SHA share the `detached`
  reason. If the phase review wants git-accurate wording, that is a one-line
  change in `Which.parseHead`.

## Handoff

- C003: `which(root, { branch?, workspace? })` lives in
  `apps/cli` (re-exported as `Cli.which` from the package root). It requires
  `SpecStore.SpecStore | FileSystem.FileSystem` and fails
  `SurfaceError | SpecStore.StoreError`. The success value is
  `WhichMatch { name, branch, feature }`; `renderWhich` prints only `name`.
  `diagnoseCause(cause, { path, rerun: 'mf-specs which', verbose })` renders
  the failure and yields exit `1`.
- The host tool's workspace side is `workspaceOf(root)` when it only has the
  store path; the server already passes the workspace through `runSlash`.
- Pure API for any consumer that already has git facts:
  `Which.resolve({ source, names })`, `Which.parseBranch`, `Which.parseHead`,
  `Which.parseGitFile`, `Which.matchFeature`. Codes live in `Which.CODES`
  (`SPEC_NO_MATCH`, `SPEC_AMBIGUOUS`), not as literals.
- `runSlash` now requires `FileSystem`; any new caller must provide it.
  `server.ts` (`CommandLive`) and the CLI test `stubLayer` already do.
- Do not restate the prefix list: read `Which.PREFIXES` / `BRANCH_PATTERN`.

## Deviations

- Added a `FileSystem` requirement to `runSlash` and `NodeFileSystem.layer` to
  the CLI test stub layer. The alternative — a second, FileSystem-free copy of
  branch detection for the slash form — is exactly what TASK forbids.
- Wrote the module and CLI tests myself (the
  `montflow-typescript-testing` author-separation rule). `ask_user` is
  unavailable to a spec worker and TASK C004 explicitly requires the tests.
- No `BOARD.md` broadcast: this phase has no `BOARD.md`, and this run limits
  writes to this `MEMORY.md`.
- No git commit, per the worker contract.

### Gates (verbatim)

```
$ bun run --cwd packages/specs test
$ vitest run --typecheck
Testing types with tsc and vue-tsc is an experimental feature.
Breaking changes might not follow SemVer, please pin Vitest's version when it does.

 RUN  v5.0.4 /home/daniel/dev/montflow/spec-optimizations/packages/specs


 Test Files  70 passed (70)
      Tests  644 passed (644)
Type Errors  no errors
   Start at  12:20:30
   Duration  2.01s (import 87%, transform 6%, tests 5%, typecheck 2%, worker 1%)
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
```
(exit 0; only Node's `MODULE_TYPELESS_PACKAGE_JSON` notices for the lint config)

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 310ms on 142 files using 16 threads.
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
```
(exit 0)

### CLI evidence (verbatim)

From `feat/spec-optimizations` (TASK Completion line 57):

```
$ bun run --cwd packages/specs cli which --dir "$PWD"
$ bun run src/apps/cli/main.ts which --dir /home/daniel/dev/montflow/spec-optimizations
spec-optimizations
```
(exit 0)

A branch that matches two specs (`/tmp/opencode/c004-ambiguous`, specs
`spec-one` and `spec-two`, HEAD `ref: refs/heads/feat/spec`):

```
$ bun run --cwd packages/specs cli which --dir /tmp/opencode/c004-ambiguous
$ bun run src/apps/cli/main.ts which --dir "/tmp/opencode/c004-ambiguous"
code     SPEC_AMBIGUOUS
path     /tmp/opencode/c004-ambiguous/.agents/@montflow/specs
field    branch
problem  Feature 'spec' from branch 'feat/spec' matches 2 specs.
expected exactly one spec name equal to the feature or a prefix of it
actual   feat/spec · candidates spec-one, spec-two
fix      Pass --name spec-one or --name spec-two.
next     ask the user
error: script "cli" exited with code 1
```
(exit 1)

A detached HEAD (`/tmp/opencode/c004-detached`, HEAD `0123456789ab…`):

```
$ bun run --cwd packages/specs cli which --dir /tmp/opencode/c004-detached
$ bun run src/apps/cli/main.ts which --dir "/tmp/opencode/c004-detached"
code     SPEC_NO_MATCH
path     /tmp/opencode/c004-detached/.agents/@montflow/specs
field    branch
problem  HEAD is detached at 0123456789ab; no branch is checked out.
expected a branch shaped <prefix>/<feature-name> (feat, fix, chore, docs, refactor, test, perf, build, ci, release, hotfix)
actual   detached · branch none · candidates ship-login
fix      Pass --name ship-login.
next     ask the user
error: script "cli" exited with code 1
```
(exit 1)

The worktree `.git`-file form (`/tmp/opencode/c004-worktree/.git` =
`gitdir: ../c004-gitdirs/wt-a`, HEAD `ref: refs/heads/feat/ship-login`):

```
$ bun run --cwd packages/specs cli which --dir /tmp/opencode/c004-worktree
$ bun run src/apps/cli/main.ts which --dir "/tmp/opencode/c004-worktree"
ship-login
```
(exit 0)

`--branch` overrides detection with no usable `.git`:

```
$ bun run --cwd packages/specs cli which --branch feat/ship-login --dir /tmp/opencode/c004-detached
$ bun run src/apps/cli/main.ts which --branch feat/ship-login --dir "/tmp/opencode/c004-detached"
ship-login
```
(exit 0)
