# @montflow/specs

Spec primitives and a CLI for montflow — the v2 phase tree (`SPEC.md` + one
directory per phase + one directory per task), schema-backed parsing, mechanical
verification, derived state, the generator verbs that write every verifiable
record, and the shipped authoring, execution, sizing, and rigor payloads that
`mf-specs author`, `execute`, `sizing-config`, `rigor`, and `which` render and
resolve.

## CLI

```bash
# from anywhere in the repo (workspace bin link via the root devDependency)
bunx mf-specs check --name ship-spec
npx mf-specs check --name ship-spec

# or by package script
bun run --cwd packages/specs cli check
```

### Spec layout (v2)

A spec is `SPEC.md` plus one directory per phase; a phase is a directory with
its own record, never a task-id prefix.

```text
.agents/@montflow/specs/<name>/
  SPEC.md                  # name, status, workspace-type, spec-version: 2
  sizing.json              # optional dispatch config
  <PHASE>/                 # A, B, … — one directory per phase
    PHASE.md               # objective, status, review, review-reason, gate
    MEMORY.md              # phase memory
    BOARD.md               # phase broadcast channel
    GATES.md               # optional phase gate, stages classified by kind
    GATE-RESULTS.jsonl     # optional recorded gate results
    <PHASE><NNN>-<name>/   # one directory per task
      TASK.md
      MEMORY.md
      GATES.md             # optional task gate
      MAILBOX.md           # optional task channel
      GATE-RESULTS.jsonl   # optional recorded gate results
```

The spec root holds only `SPEC.md`, optional `sizing.json`, and phase
directories. A phase holds only the files above plus task directories. No lock
file exists: a phase lock is derived, and `mf-specs lock` only confirms it.

**Versions and the v1 read rule.** `spec-version: 2` is current. A spec with no
`spec-version` reads as **v1**: the B001 phase tree without `PHASE.md`. V1 is
accepted with one `spec.version-outdated` warning and exits 0; `PHASE.md` and a
phase `MEMORY.md` are optional at v1 and required at v2. No surface infers v2
from file presence, no surface requires `PHASE.md` at v1, and no surface offers
a frozen spec for dispatch. A flat tree (task directories at the spec root) is
not v1 — it is an error, and `mf-specs migrate` is the fix. A complete spec is
**frozen** at its current version and is skipped by `migrate --all`; only an
explicit `migrate --name <spec> --include-complete` upgrades it. Relabeling
`spec-version: 2` without the phase tree fails
`spec.version-untransformed`.

- `check` — verifies the whole spec root (default
  `.agents/@montflow/specs`) or one `--name`. Token-lean by default
  (failures + summary), with every coded warning for a spec on one grouped
  line; `--verbose` also lists passing specs and the
  root, and adds the cause chain and layer trace for sizing findings.
  Exits non-zero when any spec fails.
- `status --name <spec>` — lifecycle, task counts, a per-phase line with the
  review decision, gate kind, proof, and derived lock, and the verification
  verdict. Exits non-zero when the spec fails verification, including the
  review budget read from the review store.
- `state --name <spec>` — compact derived state: status, lifecycle state,
  active phase, derived locked phases, and the active phase's review decision
  and gate proof. A phase is locked when every task under it is complete, every
  classified mechanical gate is proven, and a review round is closed or the
  waiver is effective. Exits non-zero on the same dispatch errors `status`
  reports, and names them: a blocked spec appends `· blocked <codes>` and
  `next mf-specs status --name <spec>` to the one-line state, with `--verbose`
  expanding the full blocker blocks.
- `next --name <spec>` — the ready task set for the active phase
  (pending tasks whose `depends-on` targets are complete, review last;
  `gated` marks a task with a `GATES.md`). The head carries the phase budget,
  review decision, and gate proof. Exits non-zero on every error `check`
  reports — config, task size, tree, or review budget — so `status`, `next`,
  and `check` agree.
- `create --name <spec>` — deterministic, model-free scaffold: writes
  `SPEC.md` with `spec-version: 2`, one `<PHASE>/PHASE.md` + `MEMORY.md` per
  phase, and one `<PHASE>/<PHASE><NNN>-<name>/` task directory per `--tasks`
  entry (each `name[:type[:gates[:size]]][:scope=path,path]`, with `size`
  defaulting to `medium` when the token is absent or blank). Separate tasks with
  `;` (`first:execution;build`), or with a comma when the current entry has no
  `scope=` field (`first:execution,second:execution`); everything after
  `scope=` up to the next `;` is that task's scope list, so
  `first:execution:scope=app,lib,docs` is one task with `write-scope: app,lib,docs`
  — the same reading `init` and the scope verifier use. The one refused shape is
  a comma fragment that itself carries a `:` after a scope list, because it is
  task-shaped and could start a new task; the refusal names both readings — write
  `first:execution:scope=app,build;second:execution` instead. A sixth token is an
  error rather than silently ignored. Every
  generated `TASK.md` carries a `write-scope:`: `none` for a review,
  exploratory, or planning task and `.` for execution work, overridden by
  `scope=`. It emits a review task only when `--tasks` requests `name:review`;
  nothing is reserved or auto-appended. Refuses to overwrite an existing spec.
  Optional `--description`, `--author`, `--workspace-type in-place|worktree`.
  A scaffold with two execution tasks must declare distinct `scope=` values (or
  add a real `depends-on` edge); otherwise `check` reports
  `phase.write-scope-overlap`, exactly as it would for hand-authored work.
- `init --name <spec> --rigor <trivial|light|standard|deep|critical>` — the rigor-aware scaffold.
  Validates the phase range, exploration rule, work-task ceiling, gate kind,
  waiver policy, review decision, and dependency graph, then writes the whole v2
  tree: `SPEC.md` with `## Creation`, every `PHASE.md`/phase `MEMORY.md`, each
  `TASK.md`/`MEMORY.md`/`GATES.md`, the channels, and `## Tasks`. Phase and task
  ids are allocated from plan order, never from argv. Repetition flags carry the
  plan; a violation is a coded refusal and writes nothing.
- `new-phase --name <spec> --objective <line>` — allocate the next phase id and
  write its `PHASE.md`, `MEMORY.md`, and optional `BOARD.md`/`GATES.md`.
- `new-task --name <spec> --phase <id> --task <kebab-name> --type <type>` —
  allocate the next task number in that phase, write its `TASK.md`/`MEMORY.md`
  (and `GATES.md` with `--gates`), and append its sorted `SPEC.md` row. It writes
  a `write-scope:` (`none` for review/exploratory/planning, `.` for execution,
  defect, or interruptor work) unless `--write-scope <paths|none>` overrides it.
- `stamp [--format instant|date]` — print one UTC timestamp from the system
  clock. Writes nothing; never type a timestamp by hand.
- `claim --name <spec> --task <id>` — bind a session to a task. The orchestrator
  forms are `--orchestrator`, `--start`, `--block --reason`, `--close`, and the
  resetting `--release`; a worker may bind and release only itself. A status
  transition writes `TASK.md`, the `SPEC.md` row, and the `PHASE.md` mirror in
  one temp-then-rename transaction under a registry lock, and rolls every record
  back on failure. `--close` validates the completion checklist and every
  required mechanical gate and derives the spec status, so the last close writes
  `status: complete`.
- `lock --name <spec> --phase <id>` — confirm the derived lock. Writes nothing;
  prints `locked <phase>` at exit 0 or one blocker code per line at exit 1.
  A phase is locked only when every task is complete, every classified
  mechanical gate is proven, and a review round is closed, the waiver is
  effective, or the phase declares `review: none`. It is not a lock list and
  owns no field.
- `waiver --name <spec> --phase <id> (--waived --reason <line> | --required)` —
  write or clear the phase review decision and recompute the gate evidence that
  stands in for a round. A waived phase cannot hold a review task. A phase with
  `review: none` holds no review task and needs no waiver: set it at authoring
  time with `new-phase --review none` or `init --review <PHASE>:none`.
- `rigor <trivial|light|standard|deep|critical>` — print the installed rigor file verbatim and
  nothing else. A missing file is `rigor.missing`; a packaged copy that differs
  is `rigor.stale`. Never list the rigor directory or load two rigors.
- `migrate [--name <spec> | --all] [--dry-run] [--include-complete]` — move flat
  task directories under their `<PHASE>/` directory, then upgrade a v1 phase
  tree by writing the missing `PHASE.md`/phase `MEMORY.md` and `spec-version: 2`.
  A mixed tree is refused, an already-migrated tree is a verified no-op, and a
  failed move or failed post-move verification rolls every applied move back so
  the store is never half-migrated. A `status: complete` spec is `frozen` and
  skipped unless `--include-complete` is passed.
- `gate run --name <spec> --phase <id> [--task <id>] [--stage <n>] [--all]
[--scope <token[,token]>|repo] [--lane heavy|light] [--no-reuse]
[--lanes <n>] [--in-flight <n>] [--wait-timeout <s>] [--timeout <s>]` —
  execute mechanical stages from the workspace root through the verification
  scheduler (see [Verification scheduler](#verification-scheduler)) and append
  the key, scope, lane, wait, reuse source, duration, exit status, timestamp,
  and captured output to the owner's `GATE-RESULTS.jsonl`. A second requester
  for an in-flight key waits and consumes the first result; a matching pass is
  reused unless `--no-reuse` forces a run. Stops at the first failure unless
  `--all`.
- `gate record --name <spec> --phase <id> [--task <id>] --stage <n> --judge
<slug> --verdict pass|fail --note <text>` — record one subjective verdict.
  The CLI never marks a subjective stage passing on its own.
- `mail --name <spec> --to <task-id|all> --text <text> [--phase <id>]` — append
  one board (or mailbox) entry; the sender comes from the orchestrator binding,
  and a live target is steered while an absent one queues.
- `review decide --name <spec> --phase <id> [--mode guided|autonomous] [--json]`
  — compute the review-cycle decision from the store. Read-only; see
  [Review cycle decisions](#review-cycle-decisions).
- `author --request <text> --rigor <level> --isolated <yes|no> [--notes <text>]
[--origin current|main|other --worktree-name <name> [--origin-branch <branch>]]`
  — loads the `spec-create` prompt (gated on `mf-specs doctor`), renders it with
  the request and the user's choices, and prints it and nothing else. `rigor` and
  `isolated` are required and have no default; the isolation answers are only
  accepted (and only rendered) when `isolated` is `yes`, and `--origin-branch`
  is required only for `--origin other`. A missing or invalid answer is
  `cli.invalid-argument` with the exact rerun. Model-free: the binary never
  dispatches a session.
- `execute [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`
  — loads the `spec-execute` prompt with the derived state, ready set, and
  review budget, and prints it. An explicit `--name` wins; otherwise it asks
  `which` which spec the checked-out branch names. Derived state drives begin
  versus resume, so one command covers both. `--phase` may only name the active
  phase: a locked or later phase fails `spec.phase-not-active`, and a spec with
  no active phase fails `spec.no-active-phase` instead of rendering a session.
  A blank `--phase` is absent; a padded or otherwise malformed one is
  `cli.invalid-argument`, the same rule `sizing-config` applies.
- `which [--branch <name>] [--dir <path>]` — the mechanical spec resolver:
  prints exactly one spec name and nothing else. On no match or an ambiguous
  match it exits non-zero with the branch it read, every candidate spec, and
  the exact `--name` to pass. `--branch` overrides detection for tests and CI;
  `--dir` defaults to the nearest repository root.
- `models [--provider <id>] [--json] [--catalog <path>] [--verify [--name <spec>]]`
  — the harness model catalogue: one line per model with its effort variants
  (`variants unknown` vs `variants none`) and a `*` on the default. `--json`
  prints the stable, date-free document that is also valid `--catalog` input.
  Without a host catalogue, pass `--catalog`; a bare run fails
  `models.unavailable` and names that flag. `--provider` keeps one provider on
  either action, and a miss is `models.unknown-provider` rather than an empty
  table. A filtered `--json` document carries `"default": null` unless the
  default model itself survives the filter, so the document never points at a
  model it does not list — and it stays valid `--catalog` input. `--verify` cross-checks the repo config, or the named spec's config
  including every phase override, and reports `models.unknown-model` /
  `models.unknown-effort` as warnings because a host catalogue can be partial;
  an unknown variant list never produces an effort finding. With `--verify`,
  `--provider` scopes the checked entries to that provider and an unknown spec
  is `spec.not-found`; `--json` is refused with `cli.invalid-argument` because
  verification has no JSON document. Every `--verify` run ends with one count
  line — entries checked and skipped, split by layer and provider — so a pass
  that checked nothing states its zero instead of printing a bare success. The
  `provider` segment appears only when a filter was applied, so an unfiltered
  run can never be read as a pass filtered to a provider named `all`.
- `sizing-config [--scope repo|spec|phase] [--name <spec>] [--phase <id>] [--focus <text>] [--mode guided|autonomous]`
  — renders the `spec-sizing` wizard for one config layer and prints it. It
  writes no file and dispatches nothing; the wizard confirms before writing.
  With no scope flag the scope is open and the prompt asks. `--name` alone
  implies spec, `--name --phase` implies phase, and `--scope` wins over the
  implication. A missing identifier, a contradictory `--scope`, an unknown
  scope, or an invalid mode exits non-zero with the corrected command.
- `resolve --name <spec> --task <id>` — machine-only: prints exactly the task's
  dispatch target (`provider/model#effort`) or `inherit`, and nothing else.
  Exits non-zero for an unknown spec or task, an invalid config, or a task
  whose size is missing or unknown.
- `sizing --name <spec> --task <id> [--verbose|--human]` — inspects one task's
  size. Default output is one compact line: task id, declared size, effective
  target, and winning layer. `--verbose` and `--human` are the same detailed
  mode: budgets plus a size-by-layer provenance matrix.
- `list [--pending | --status <states>] [--verbose]` — lists every
  spec with its derived lifecycle state and task counts. A v2 spec appends its
  derived locked phases and per-phase review decisions; a v1/frozen spec keeps
  the original line. `--pending` keeps every unfinished spec; `--status` takes
  a comma-separated list of `pending`, `in-progress`, `blocked`, `complete`,
  `inconsistent` (`completed` is accepted as an alias for `complete`). The TUI
  picker reads the same engine, so it previews derived state and offers only
  directories holding `SPEC.md`.
- `doctor [--check]` — reads this package's `payload.json` and checks or repairs
  every declared artifact: the `montflow-create-specs` and `montflow-find-specs`
  skills, `spec-create.json`, `spec-execute.json`, `spec-sizing.json`, and the
  `trivial`/`light`/`standard`/`deep`/`critical` rigor files. `--check` writes nothing and reports
  `ok` / `missing` / `stale` / `mismatched` / `blocked` per payload. Repair mode
  distinguishes `present` / `installed` / `repaired` / `blocked` and reports a
  `blocked` payload with a coded failure instead of aborting the run. Skill
  repair rewrites only the files the package ships and leaves any other file in
  the directory in place. Idempotent; resolves the repo root from the working
  directory. It never touches any prompt, skill, or rigor it does not own. The
  other skills the shipped prompts declare are external prerequisites, not
  doctor payloads: see
  [Prerequisite skills and advisories](#prerequisite-skills-and-advisories).

### Authoring, execution, sizing, and surfaces

`author`, `execute`, and `sizing-config` render; they do not dispatch. The
binary loads the shipped prompt, gates it on `mf-specs doctor`, renders it from
the spec or flag state, and prints it. Inside the OpenCode host, `/specs author`
/ `/specs execute` / `/specs sizing-config` and the `spec_author` /
`spec_execute` / `spec_sizing` tools dispatch the same rendered text
through `@montflow/prompts`' executor. A missing or stale prompt fails before
anything renders, with the file, the problem, and the `mf-specs doctor` fix.

Every generator verb is on the `/specs` surface with the same arguments and
engines as the binary: `check`, `status`, `state`, `next`, `resolve`, `sizing`,
`models`, `which`, `list`, `create`, `migrate`, `init`, `new-phase`, `new-task`,
`stamp`, `rigor`, `claim`, `lock`, `waiver`, `gate`, `mail`, `author`, `execute`,
and `sizing-config`. `review decide`, `doctor`, and `version` are binary-only.
The host tools are
`spec_author`, `spec_execute`, `spec_sizing`, `spec_rigor`, and `spec_models`;
`spec_rigor` returns the installed rigor verbatim, with the same refusal codes as
`mf-specs rigor`. The TUI picker previews derived state and never offers a phase
or task directory as a spec. No surface reads or writes a lock file.

The `/specs` form validates flags per command. Every verb accepts `--dir` and
`--verbose`, plus the flags its binary counterpart implements; a flag the verb
does not implement is refused with `cli.invalid-argument`, the row of flags it
does accept, and the `next` command to run instead — `/specs execute --scope repo`
points at `/specs sizing-config --scope repo`, and `/specs check --json` at
`/specs models --json`. A flag no verb reads is refused the same way, so a typo
can never parse into silence.

#### Prerequisite skills and advisories

`mf-specs doctor` installs the two skills this package owns and treats them as
required. The shipped prompts also declare skills this package does not ship, and
those are advisory.

Required skills and advisory skills, by prompt:

- `spec-create` requires `montflow-create-specs`; advisory:
  `using-git-worktrees` (the isolated branch loads it).
- `spec-execute` requires `montflow-find-specs`; advisory:
  `montflow-adversarial-review`, `montflow-addressing-adversarial-review`.
- `spec-sizing` requires `montflow-find-specs` and `montflow-create-specs`;
  advisory: `executing-skills`, `grilling`, `i-have-adhd`.

A missing, stale, or blocked **doctor-owned** skill fails prompt load before
anything renders with `prompt.skill-missing`, `prompt.skill-stale`, or
`prompt.skill-blocked`, the skill as `field`, and `mf-specs doctor` as the fix. It
is never downgraded to an advisory.

A missing **non-owned** skill does not fail the load. The prompt renders, the
rendered text ends with a `prompt.skill-advisory` block naming every missing
skill with its install command, and `LoadedPrompt.advisories` carries the same
diagnostics for a caller that reports rather than prints. `LoadedPrompt.skills` —
the list handed to the executor — contains only the declared skills installed in
the workspace, in declaration order. Install one with:

```bash
npx skills add montflow/montflow -s <skill> -y
```

The behavior is deliberate: doctor's ownership boundary stays exactly the two
spec skills and the three prompts it ships, while a fresh workspace with only
`mf-specs doctor` applied can still render every shipped prompt.

`sizing-config` sizes exactly one layer — repo-wide, one spec, or one phase —
and writes nothing itself. With no scope flag the prompt asks which layer;
`--name` alone implies spec, `--name --phase` implies phase, and `--scope` wins
over the implication.

```bash
# render the authoring prompt with the user's request and choices
bun run --cwd packages/specs cli author --request "Ship login" --rigor standard --isolated no

# the isolated form needs the origin and the worktree name too
bun run --cwd packages/specs cli author --request "Ship login" --rigor standard \
  --isolated yes --origin main --worktree-name ship-login

# begin or resume the spec whose name the current branch names;
# on feat/ship-login this resolves ship-login
bun run --cwd packages/specs cli execute --mode autonomous

# render the sizing wizard for one spec's config, or leave --scope off
# so the wizard asks which layer to size
bun run --cwd packages/specs cli sizing-config --scope spec --name ship-login
```

`--mode` accepts exactly `guided` (the default) and `autonomous`. `guided`
keeps the human in the loop and may ask whenever a decision benefits from it.
`autonomous` asks only for a destructive or irreversible action, a very
dangerous tool call, or a decision the agent genuinely cannot make from the
spec and the evidence; every other decision is recorded in `MEMORY.md`. The
mode changes interaction only — dispatch order, `depends-on`, gates, phase
review, locking, and verification are identical in both.

### Spec detection (`which`)

`execute` without `--name` asks `mf-specs which` which spec the checked-out
branch names, so the branch is the default selector. A branch is
`<prefix>/<feature-name>`: a lowercase conventional prefix — `feat`, `fix`,
`chore`, `docs`, `refactor`, `test`, `perf`, `build`, `ci`, `release`, or
`hotfix` — then the feature name after the first `/`, lowercased with `/` and
`_` normalized to `-`. Matching is exact first, then a unique prefix match
between the feature name and a spec name where the shorter name ends at a `-`
boundary: `feat/ship` matches `ship-login`, while `feat/s` matches nothing
because `s` stops inside `spec-optimizations`. A prefix must stop on a segment,
never mid-word. There is no fuzzy, edit-distance, or keyword matching.

A detached HEAD, a branch without a conventional prefix, no candidate, two or
more prefix candidates, or unreadable git metadata all mean "no match". The
command exits non-zero with the branch it read, every candidate spec, and the
exact `--name` to pass. The agent must then ask the user which spec to run and
must never pick one. `--branch <name>` overrides detection for tests and CI,
and detection reads a worktree's `.git` file as well as a plain `.git`
directory.

`npx`/`bunx` resolve the workspace `bin` link inside this repo (the root
`devDependencies` entry is what creates it). From a registry
(`npx @montflow/specs` / `bunx @montflow/specs`) the package
must be published first — it is `private` today. The `bin` is a `.ts`
entry with `#!/usr/bin/env bun`, so registry use needs Bun on the
machine; a Node build would be required for `npx` without Bun.

Built with `effect/cli`. Sample specs for trying the binary
live in [`fixtures/`](fixtures/README.md): `mock-ok` (pending),
`mock-complete` (complete), `mock-stale` (inconsistent), `mock-history` (an
untouched record at its review budget), `mock-over-budget` (one review-budget
error), and `mock-bad`
(10 issues across every failure class).

## Phase shape and channels

A phase is authored as the **widest ready set**, not a queue: list the tasks that
can run at once and dispatch them together. `depends-on` carries only a real data
or ordering dependency; "same area" is not one, and a serial chain is a stated
decision (`serial-reason: <one line>` in `PHASE.md`) rather than a default.

Every task declares `write-scope:` in `TASK.md` frontmatter: a comma-separated
list of repo-root-relative POSIX paths, an optional trailing `/` for a subtree,
`.` for the whole repo, or `none`; the task directory is implicit. `init`,
`new-task`, and `create` write the field. A pending non-review task without it is
`task.write-scope-missing` (warning). Two unfinished tasks in one phase whose
scopes overlap without a `depends-on` edge are `phase.write-scope-overlap`
(error), fixed by adding the real edge or splitting the phase. A v2 phase whose
non-review tasks chain one after another with no other edges is
`phase.serial-chain-unexplained` (warning) until `PHASE.md` states
`serial-reason: <one line>`. `next` returns the ready set — pending tasks whose
`depends-on` targets are complete — and readiness is the only dispatch signal.

A spec has two gate layers. A task `GATES.md` holds commands scoped to that task
and proof of that task alone. Phase-shared and repo-wide checks live once in the
phase `GATES.md`, with `scope:` (a path token or `repo`) and `lane:
heavy|light`; the orchestrator runs that gate once at the phase boundary and the
scheduler reuses the pass. `check` reports `gate.shared-check-in-task` when a
task stage's scope is not contained in the task's `write-scope:` (including
`repo`), `gate.duplicate-command` when the same normalized command with
overlapping scope appears in two gates of one spec, and `gate.scope-missing`
(warning) when an unfinished v2 mechanical stage has no resolvable scope.

The phase directory carries the two channels. `BOARD.md` is broadcast (`mail --to
all`): phase boundaries, a shared gate that ran or was reused, a closed
dependency, lane config. `MAILBOX.md` is targeted (`mail --to <task-id>`) to one
task. The orchestrator is the sole writer; a worker reads the board and its
mailbox at start and again before its receipt, and a channel never substitutes
for a `depends-on` edge.

## Verification scheduler

`gate run` is scheduled, not merely executed. One run is keyed by its normalized
command, its scopes, and a fingerprint of the files those scopes cover:

```text
key = gate-v1: sha256( normCommand + "\n" + scopes.join(",") + "\n" + fingerprint )
fingerprint = sha256 over "path\0sha256hex(bytes)\n" for every file in scope
```

`normCommand` trims and collapses whitespace; `scopes` are sorted unique tokens
(`repo` or a repo-root-relative path, `.` normalizing to `repo`); a symlink
contributes its target string. Task, phase, stage, and session ids never enter
the key, so the same proof shared by two owners is one key. `.git/`,
`node_modules/`, `.turbo/`, `dist/`, `build/`, `coverage/`, the runtime tree, and
every `GATE-RESULTS.jsonl` are skipped, so recording a result never invalidates
the key that produced it.

A stage's scope resolves as `--scope` → the stage's `scope:` line → the owner's
scope (a task's `write-scope:`, or `repo` for the phase gate). A `--scope`
override must cover every selected stage's declared scope; it may widen but not
narrow, and a narrower override is `gate.invalid-scope`, refused before any stage
runs because it cannot prove the stage. A task gate with no
resolvable scope is `gate.scope-missing`. A stage may declare
`lane: heavy|light`; an absent lane classifies a suite, typecheck, build, lint,
format, or repo/package-wide check as heavy and a narrow check as light.

Single flight: at most one attempt per key is `running`. A second requester
registers as a waiter, prints `waiting key <key> · lane <lane> · position <n> ·
owner <task>`, and consumes the owner's recorded result; it never spawns. A
`passed` key is reused while its fingerprint matches and prints `reused <key>
from <source>`; any input change yields a new key, so an old pass cannot be
consumed. A `failed`, `timeout`, or `cancelled` result is never reused as a pass:
a later requester reruns it and waiters of the same attempt consume its failure.
`--no-reuse` forces a run.

Bounds come from `<workspace>/.agents/@montflow/gate.json`, every key optional:

```json
{
  "heavy": { "lanes": 1, "inFlight": 2 },
  "leaseSeconds": 60,
  "heartbeatSeconds": 10,
  "waitTimeoutSeconds": 900
}
```

The heavy lane defaults to one run at a time; light checks never wait behind it
but count toward the global in-flight cap. `--lanes`, `--in-flight`, and
`--wait-timeout` override the file for one invocation, and any bound below `1`
is `gate.invalid-config`. `heartbeatSeconds` must be strictly less than
`leaseSeconds`, or `gate.invalid-config` refuses a lease that would expire before
its first renewal. A waiter past its cap exits non-zero with
`gate.wait-timeout` and runs nothing.

Run state lives only at `.agents/@montflow/.runtime/runs/<sha256(key)>.json`
(`version`, `key`, `command`, `scope`, `fingerprint`, `state`, `lane`,
`attempts`, `waiters`, `resultPath`, `resultIndex`), guarded by one `runs.lock`
and written temp-then-rename. A failed claim or terminal write is
`gate.write-failed`, never a silent run. Terminal states are pruned past a
one-day TTL while the newest 50 are kept, and `status` renders live runs plus the
20 most recent terminal ones, so an edit history cannot grow the panel without
bound. An owner heartbeats its lease; a requester that
finds a lease past `leaseExpiresAt` or a dead `pid` marks the attempt `expired`,
appends no result, starts attempt n+1, and prints `reclaimed <key> attempt <n>`.
A timeout records `state: timeout`, `verdict: fail`, `exit: 124`; an interrupted
run records `cancelled`, `exit: 130`. Neither is ever a pass.

Visibility: `gate run` prints `key <key> · scope <scope> · lane <lane>
<inflight>/<lanes> · waited <ms> · ran|reused <source> · fingerprint <fp>`;
`status` prints `runs <n> in-flight · <n> queued · <n> stale` and one
`run <key> <lane> <inflight>/<lanes> <task> <state> <elapsed>` line per run;
`next` marks a gated task `gate task-local <scope>` and the phase head
`phase-gate <kind> repo · shared once at boundary`.

Truthfulness: `check` recomputes every keyed pass against the stage's declared
scope and the current files, and reports `gate.stale-result` (error) with the
owner, stage, stored key, and current key when the inputs moved or a record's
scope does not cover the stage's declared scope. A pass on an unfinished owner with
no key is `gate.result-unkeyed` (warning); on a complete owner it is an error
when the stage declares a `scope:`, and exempt only for a legacy stage with no
declared scope. A pass whose own scope no longer exists is `gate.scope-missing`
(warning), not a silent green, and a pass whose verdict and exit disagree is
already `gate.result-inconsistent`. The scheduler's own refusals are
`gate.scope-missing`, `gate.invalid-scope`, `gate.invalid-lane`,
`gate.invalid-config`, `gate.wait-timeout`, and `gate.scheduler-lock`.

## Artifact payload

The skill, prompt, and rigor files this package ships are declared in
[`payload.json`](payload.json) and copied into the workspace by `doctor`:

| Kind     | Source                | Installed target                        |
| -------- | --------------------- | --------------------------------------- |
| `skill`  | `skills/<name>/`      | `.agents/skills/<name>/`                |
| `prompt` | `prompts/<name>.json` | `.agents/@montflow/prompts/<name>.json` |
| `rigor`  | `rigors/<name>.md`    | `.agents/@montflow/rigors/<name>.md`    |

The manifest is the only name list: `SPEC_SKILL_NAMES`, `SPEC_PROMPT_NAMES`, and
`SPEC_RIGOR_NAMES` are derived from it. `@montflow/payload` owns the one
compare/install engine and the embedded-payload generator every payload package
uses.

**Two modes, one engine.** `mf-specs doctor --check` is report-only: it writes
nothing, performs no directory creation, and reports `ok` / `missing` / `stale`
/ `mismatched` / `blocked` per payload with its source and target. Every
`mf-<cli>:check` script uses this mode, so `bun run mf:check` is write-free.
`mf-specs doctor` is the repair mode: it installs a missing artifact, rewrites a
stale or mismatched one from the package bytes, and reports `present` /
`installed` / `repaired` / `blocked`. A payload it cannot repair is `blocked`
with its own coded fix; one blocked payload never aborts the rest of the run.
`bun run mf:doctor` runs repair for every payload package.

A manifest-owned file edited locally is `stale`; repair overwrites it with the
package bytes, so edit `packages/specs/` and reinstall — never the workspace
copy. A file the manifest does not name, inside the same store, is user data:
doctor never reads, rewrites, or deletes it, and an extra file alone does not
make a skill stale.

The payload is embedded in the `mf-specs` binary at build time
(`bun run generate:payload` from `skills/`, `prompts/`, and `rigors/`), so
`doctor` works from the standalone binary with no package checkout beside it.
The package directory still wins when present, and
`src/modules/doctor/tests/embedded-payload.test.ts` fails if the embed drifts
from the package.

## Review cycle decisions

`mf-specs review decide --name <spec> --phase <id> [--mode guided|autonomous]
[--json]` is the only authority on review rounds. It reads every expected series
(`<spec>` plus one `<spec>-<profile>` per declared reviewer profile), the phase's
derived budget and effective waiver, and the latest round's findings, then
prints `decision`, `rounds <used>/<budget>`, `open <n> (critical a, major b,
minor c, nit d)`, `reason <code>`, and the per-series breakdown. It writes
nothing and exits 2 on an invalid invocation. An omitted `--mode` takes the
conservative `guided` branch.

The decision order is: effective waiver → `waived`; no attributed round in an
expected series → `start`; an unattributed round → `escalate`; zero open
findings → `pass`; only Minor/Nit open → `fix-and-stop`; Critical/Major with
rounds remaining → `rework`; at the cap, `guided` → `escalate`, and `autonomous`
→ one `overflow` round, then `escalate`. Across series the strictest decision
wins.

A round whose only open findings are Minor/Nit may close with
`- Disposition: minor-deferred` and `- Deferred: F1, F3` in its `## Metadata`;
every deferred finding must be Minor/Nit and terminal, or the closure is
`review.deferred-severity`. A round past the budget is legal only with
`- Overflow: <reason>` and `- Overflow-authorized: autonomous|user`; a missing
or broken authorization is `review.overflow-exhausted`, and no declaration is
`review.budget-exceeded`.

## Migration: v1 to v2

`mf-specs migrate --all` walks the store once, moves flat task directories under
their phase, and upgrades every in-progress v1 phase tree. The live store's
2026-11-03 run reported:

```text
14 specs · 0 migrated · 2 upgraded · 0 planned · 12 frozen · 0 failed
```

| Spec                            | Result            | Version after | Phases      |
| ------------------------------- | ----------------- | ------------- | ----------- |
| `cli-version-awareness`         | frozen (complete) | 1             | 0           |
| `installation-guide`            | frozen (complete) | 1             | 0           |
| `model-fallback-alignment`      | frozen (complete) | 1             | 0           |
| `montflow-ci-verification`      | frozen (complete) | 1             | 0           |
| `montflow-multi-reviewer`       | frozen (complete) | 1             | 0           |
| `montflow-opencode-migration`   | frozen (complete) | 1             | 0           |
| `montflow-phase-directories`    | frozen (complete) | 1             | 0           |
| `montflow-project-structure`    | frozen (complete) | 1             | 0           |
| `montflow-references-plugin`    | frozen (complete) | 1             | 0           |
| `montflow-references-tui`       | upgraded          | 2             | 1 (`G`)     |
| `montflow-spec-completion-gate` | frozen (complete) | 1             | 0           |
| `montflow-spec-standard`        | upgraded          | 2             | 9 (`A`–`I`) |
| `plugin-host-integration`       | frozen (complete) | 1             | 0           |
| `spec-optimizations`            | frozen (complete) | 1             | 0           |

A frozen spec stays v1 and keeps its historical tree, `*099` review tasks, and
`spec.version-outdated` warning. It is never offered for dispatch and is never
edited by a later migration. Upgrade one deliberately with
`mf-specs migrate --name <spec> --include-complete`; after that it is v2 and the
normal rules apply. The same table is recorded in the bookkeeper's artifact
ledger.

## Sizing

Every task declares `size` in `TASK.md` frontmatter: `tiny`, `small`, `medium`,
or `large`. A missing size is an error for a `pending`, `in-progress`, or
`blocked` task. A completed task may instead declare `size: none` as a
record-only opt-out; `none` is never a dispatch target, contributes no model,
and contributes zero review budget. An unfinished task that declares `none`
fails with `task.size-none-unfinished`. The size maps to a dispatch target
through optional `sizing.json` config; no config at all, or an undefined size,
resolves to `inherit`.

### Review budget

Task size also buys the phase's review-cycle budget:

| Size     | Review cycles |
| -------- | ------------- |
| `tiny`   | 1             |
| `small`  | 2             |
| `medium` | 3             |
| `large`  | 3             |

The hard cap is 3 for every phase. A review cycle is one reviewer round in each
review series, not a per-finding attempt: `Max Attempts` stays per finding and
is unchanged. A phase's budget is the largest budget among its non-review
tasks, capped at 3 —
a phase of only `tiny` tasks gets exactly one review cycle, and the phase's own
`review` task never raises its budget. A non-empty phase always gets at least
one cycle, so a phase holding only its review task (or only completed tasks
without sizes) can still be reviewed. Rounds past the budget are legal only as
an authorized overflow (`budget + 1`): one in autonomous mode, user-authorized
in guided mode, and otherwise `review.budget-exceeded` /
`review.overflow-exhausted`. `status` and `next` print the phase
budget. Compact `sizing --task` omits it: the default line carries only the task
id, declared size, effective target, and winning layer. `--verbose` or `--human`
prints the labelled budget line — `size budget <task> · contributes <cycles> ·
phase <id> · phase budget <phase>` — so the task's own size budget and the cycles
it adds to its phase are never mistaken for one another; a `review` task always
contributes `0`.

### Config

Two optional files, merged least to most specific:

| File                       | Scope     | Keys                       |
| -------------------------- | --------- | -------------------------- |
| `<specs-root>/sizing.json` | repo-wide | `sizes`                    |
| `<spec>/sizing.json`       | one spec  | `sizes`, optional `phases` |

The repo file is a config file, never a spec directory: `list` and `check` never
treat it as a spec. It has no `phases` key. Placeholder ids throughout — this
repo ships no `sizing.json` of its own:

`.agents/@montflow/specs/sizing.json`, repo-only:

```json
{
  "sizes": {
    "tiny": { "model": "provider/cheap-model" },
    "small": { "model": "provider/small-model" },
    "medium": { "model": "provider/medium-model", "effort": "high" },
    "large": { "model": "provider/large-model", "effort": "max" }
  }
}
```

`.agents/@montflow/specs/ship-login/sizing.json`, a spec override with a phase
override:

```json
{
  "sizes": {
    "large": { "model": "provider/review-model", "effort": "high" }
  },
  "phases": {
    "B": {
      "sizes": {
        "small": { "model": "provider/cheap-model", "effort": "low" }
      }
    }
  }
}
```

`model` is required in every size entry. Its first `/` separates the provider
from the model id; the model part may contain further `/` or `:` (OpenRouter
namespaces, Ollama tags), and no whitespace or `#` is allowed.
`effort` is an optional model variant as the catalogue reports it (`low`,
`medium`, `high`, `xhigh`, `max`, and any host token such as `High`) and is
invalid without `model`. Unknown keys, unknown sizes, malformed model ids,
malformed effort tokens, non-object entries, and malformed phase keys are
errors. A well-formed phase key that matches no phase in the spec is a warning:
the override is unused, not invalid.

### Merge rule

For one size, the most specific layer that defines the entry replaces the whole
entry: phase beats spec beats repo, and fields are never partially inherited. A
phase entry that sets `effort` without `model` is invalid rather than half-used.
A size no layer defines is `inherit`: the dispatcher omits the `model` argument
and the current model runs. A repo-only config is valid with no spec file, and
`status` / `next` report each task's size, target, and source layer so an
orchestrator can dispatch without re-reading config.

### Generating a sizing config

Do not hand-write a config. Generate one layer at a time with the `spec-sizing`
wizard — `mf-specs sizing-config` in the binary, `/specs sizing-config` or the
`spec_sizing` tool in the host — and never type a model id or an effort from
memory. The wizard is a conversation, not a one-shot generator. Its order is
fixed:

1. **Show what exists.** It reads `<specs-root>/sizing.json` verbatim, runs
   `mf-specs list`, and — for a spec or phase target — also
   `mf-specs status --name <spec>` plus `<spec>/sizing.json`, then prints the
   current size → target mapping and every file it found, including "none". No
   question comes before this read.
2. **Resolve the scope.** With no fixed scope it asks for repo-wide, one spec,
   or one phase, using the existing config as the context for the choice, and
   shows the chosen spec's mapping before proposing.
3. **Inventory the catalogue.** It reads `mf-specs models --catalog <path>`
   outside the host (or the `spec_models` `list` action in the host) and uses
   only what that reports. A bare `mf-specs models` needs a host model source;
   without one it fails `models.unavailable`, so pass `--catalog <path>`.
4. **Propose all four sizes.** `tiny`, `small`, `medium`, and `large`, each an
   explicit `provider/model[#effort]` target or an explicit `inherit`, each with
   one line of reasoning and its cost/quality tradeoff.
5. **Confirm.** It shows the exact JSON and the exact path and waits. A
   different non-empty value replacing an existing entry needs a second
   permission; an unchanged entry, an empty entry, and a new file do not.
6. **Write exactly one layer.** Unrelated sizes, `phases` entries, and keys
   survive; a second layer takes a second run.
7. **Prove it.** `models --verify` for the touched scope (with
   `--catalog <path>` outside the host), then `check` for the same scope, then
   `sizing --task <id> --human` for one task per explicit target. A failing
   check blocks the report; the report carries the path, the four-size mapping,
   the catalogue entries used, and every result.

The config is generated from the live catalogue rather than remembered because
the catalogue is the only authority on what this harness can dispatch. A model
id is valid only if the catalogue lists it — `spec_models` in the host,
`mf-specs models --catalog <path>` outside it — and `--json` is stable enough
to round-trip as `--catalog` input. The catalogue only advertises targets a
config can hold: a host id, variant, or default label the sizing grammar
rejects is dropped at the boundary (a known variant list filtered to nothing
stays `variants none`, never `variants unknown`), while a hand-written
`--catalog` file that carries one fails `models.malformed-catalog` instead of
being silently trimmed.
`mf-specs models --verify [--name <spec>]`
cross-checks every config entry against it and reports `models.unknown-model` /
`models.unknown-effort` as warnings, aggregated in one pass. Outside the host,
pass `--catalog <path>`; the binary resolves it against the process directory
while `/specs models` resolves it against the plugin workspace.

**Effort comes from variants.** Each catalogue entry either carries its effort
variants or says it does not know them. `variants unknown` (`null`) and
`variants none` (`[]`) both forbid an effort for that model, and a known list
authorizes only the exact tokens it contains — `high` is not a synonym for
`max`. A model with unknown variants never gets an `effort`, and no token is
ever copied from memory.

**Open versus fixed scope.** No `--scope` leaves the layer open and step 2 asks.
`--name` alone implies spec, `--name --phase` implies phase, and an explicit
`--scope` overrides either implication. An incomplete or contradictory
combination — `--phase` without `--name`, `--scope spec` with `--phase`,
`--scope repo` with an identifier — exits non-zero with the corrected command
instead of guessing a layer. The command renders and writes nothing; the only
write is the agent's post-confirmation edit.

**`inherit` is a decision.** Every size is decided explicitly, and a size with
no reason to differ from the current model is an explicit `inherit`: the
dispatcher omits the `model` argument and the current model runs. The wizard
never fills a size merely to fill the file, and a run that would change nothing
writes nothing. It never edits a task size, a `TASK.md`, `SPEC.md`, or spec
state, and a repo-wide run never adds a `phases` key.

A session, with placeholders for every id. `[wizard]` lines are the agent's
report; the `$` lines are commands it ran:

```text
$ mf-specs sizing-config --name ship-login
[wizard] scope: spec ship-login (fixed by --name); existing config: none, so
         every size is inherit.
[wizard] catalogue:
$ mf-specs models --catalog <path>
provider/cheap-model  variants none
provider/deep-model  variants high,max
provider/standard-model  variants high,low,max  *

[wizard] proposal -> .agents/@montflow/specs/ship-login/sizing.json
  tiny    provider/cheap-model            mechanical edit; no effort, variants none
  small   provider/standard-model#high    bounded change; high is on its list
  medium  provider/standard-model#max     multi-file work; max is on its list
  large   inherit                         no better target than the current model
[wizard] write .agents/@montflow/specs/ship-login/sizing.json? [user: yes]
[wizard] wrote ship-login/sizing.json: sizes only, 2-space JSON, trailing newline
$ mf-specs models --verify --name ship-login --catalog <path>
✓ no model or effort findings

3 entries checked · 0 skipped · repo 0 checked, 0 skipped · spec 3 checked, 0 skipped
$ mf-specs check --name ship-login
1 spec · 0 failed · 0 issues
$ mf-specs sizing --name ship-login --task A002 --human
A002 · declared small · target provider/standard-model#high · source spec
size budget 2 · contributes 2 · phase A · phase budget 2

size    repo    spec                          phase   winner
tiny    absent  provider/cheap-model          absent  spec
small   absent  provider/standard-model#high  absent  spec
medium  absent  provider/standard-model#max   absent  spec
large   absent  -                             absent  inherit
```

### Diagnostics

Every sizing failure renders as one agent-first, greppable block: `code`, `path`,
`field`, `problem`, `expected`, `actual`, `fix`, and `next` naming the command to
re-run. `--verbose` adds the detail rows — `cause` when the failure wraps an
underlying error, the sizing `layers` trace, and a defect's `stack` — so the
default block stays token-lean and the flag means the same thing on every verb.
One diagnostic with every field populated (`--verbose`):

```text
code     sizing.malformed-json
path     ship-login/sizing.json
field    root
problem  Config is not valid JSON.
expected a JSON object with a "sizes" map
actual   unparseable JSON
fix      Rewrite ship-login/sizing.json as valid JSON.
cause    Expected property name or '}' in JSON at position 11 (line 1 column 12)
next     mf-specs check --name ship-login
```

`check` aggregates every sizing error across the repo config, the spec config,
and the task sizes in one pass instead of stopping at the first one — including
an unreadable config file, which becomes a coded `store.error` finding. Every
error keeps its full block. Warning findings group into one line per spec,
carrying every code with its count and a representative path — codes in sorted
order and each path a lexicographic minimum, so the line does not depend on
discovery order — so a historical
backlog stays readable; `check --verbose` expands every group back into its full
block
and adds the cause chain plus a `layers` line for sizing findings (`consulted
repo,spec` plus the winning `layer`, and the `phase` for a nested override or a
task-size finding). `check --strict` promotes warnings, which then render in
full as errors and fail the run. Exit
codes: `0` clean, `1` a validation failure, `2` an internal defect. Every
command catches `Cause`: an unexpected defect renders `code internal` and exits
`2` with its stack only under `--verbose`, while an interruption exits `130`.
`status`, `next`, and `state` gate their target columns and exit non-zero on
every error `check` reports, so a dispatchable target is never printed for a task
the contract calls invalid. They read the same review series `check` reads, so an
over-budget phase also blocks `execute` before it renders a session. Warnings
stay advisory there: `check --strict` promotes them for the gate, and that
promotion is a `check` decision, not dispatch truth, so `status`, `next`, and
`state` never block on a warning.

The record checks are errors, because a completed task whose record contradicts
itself is not a completed task:

- `task.completion-unchecked` — a `complete` task whose `## Completion`
  checklist still holds unchecked items; the message names the task file and the
  unchecked count. An unfinished task may carry an unchecked checklist with no
  finding.
- `gate.unchecked` — a `complete` task whose `GATES.md` has no checked item. An
  unfinished task may carry an all-unchecked gate with no finding.
- `task.missing-size` — an unfinished task with no `size`, or a `complete` task
  with neither a real size nor `size: none`.
- `review.phase-unattributed` — a round in a linked review series with no
  parsable `- Phase:` attribution, so it counts toward no phase budget. A
  warning, promoted by `--strict`, so a dropped or decorated line is never a
  silent exemption.
- `review.budget-exceeded` — an **error**: a review series holds more rounds
  attributed to a phase (`- Phase:` in a round's `## Metadata`) than that phase's
  size-derived budget. The message names the series, phase, budget, and actual
  count. `check` reads the review store beside the specs store
  (`<specs-root>/../reviews`); a spec with no series is skipped, so a historical
  record never turns red for predating the store, while a round file it cannot
  read is a `store.error` instead of a silently uncounted round. The execute
  prompt's review-cycle cap is therefore mechanical, not prose.

## Library surface

- **`Spec`** — `Spec` Schema Class, `SpecStatus`,
  `WorkspaceType`, `parseSpecFile`, `verifySpecFile`, the task
  table (`TaskRow`, `parseTaskTable`), and the version contract
  (`SPEC_VERSION_FIELD`, `SPEC_STANDARD_VERSION`, `readSpecVersion`).
- **`Phase`** — the `PHASE.md` record: `parsePhaseFile`, `verifyPhaseFile`,
  `derivePhaseStatus`, `parsePhaseGateStages`, `phaseEvidence`,
  `renderPhaseFile`, `renderPhaseMemory`, `PHASE_DIR_FILES`, and `PHASE_CODES`.
  `phaseEvidence` resolves gate evidence refs, the effective waiver, and the
  proven set a lock reads.
- **`Rigor`** — the `trivial`/`light`/`standard`/`deep`/`critical` enum (`RIGORS`, `isRigor`), the
  artifact contract, the waiver predicate, the `split` shape, and `readRigor`
  (installed file first, packaged file second, `rigor.missing` / `rigor.stale`).
- **`Creation`** — `## Creation` read/render (`readCreation`, `renderCreation`)
  for the rigor and the self-reported question count.
- **`Init`** — the rigor-aware tree generator: plan validation (`INIT_CODES`),
  phase/task allocation, the default plans, and the render path behind
  `mf-specs init`.
- **`Claim`** — the atomic status transaction (`claim`, `commitTransaction`):
  task status, `SPEC.md` row, `PHASE.md` mirror, and the registry binding under
  a lock, with rollback and the `CLAIM_CODES` refusals.
- **`Channel`** — the append-only `BOARD.md` / `MAILBOX.md` grammar, entry
  parsing, and delivery targets behind `mf-specs mail`.
- **`Stamp`** — the one UTC clock behind `mf-specs stamp`.
- **`Task`** — `Task` Schema Class, `TaskId`, `TaskType`, `TaskStatus`,
  the optional `size` field, the optional `write-scope` list
  (`WRITE_SCOPE_FIELD`, `writeScopeTokens`), `parseTaskDirName`,
  `parseTaskFile`,
  `verifyTaskFile`, `verifyTaskSize`, `verifyTaskCompletion` (a complete task
  with unchecked `## Completion` items is `task.completion-unchecked`), the
  optional
  `reviewer-profiles` list (`REVIEWER_PROFILES_FIELD`) on a review task, the
  `finding-ref` locator pattern (`FINDING_REF_PATTERN`), plus the task-id /
  directory / originator patterns.
- **`Gates`** — `parseGates`, `verifyGatesFile` (stages classified
  `mechanical`/`subjective` + checklist items, no placeholders), stage
  `scope:`/`lane:` metadata, `verifyGateProgress` (a complete task with no
  checked gate item is `gate.unchecked`), `verifyResultFreshness`
  (`gate.stale-result` / `gate.result-unkeyed`), and the `GATE-RESULTS.jsonl`
  reader/writer behind `gate run` / `gate record`.
- **`Scheduler`** — the verification scheduler behind `gate run`: `gateKey`
  (`gate-v1:` over normalized command, scopes, and fingerprint),
  `fingerprintScopes` (scope walk with the result/runtime exclusions),
  `parseGateConfig` (`gate.json` bounds and lease), `laneOf`, `scheduleRun`
  (single flight, waiters, reuse, lane and in-flight bounds, lease reclaim,
  timeout/cancellation), and the run-state reader/summary behind `status`.
- **`Memory`** — `verifyMemoryFile`, `MEMORY_SECTIONS` (title + template
  sections).
- **`Lifecycle`** — `analyze` / `verify`: derives `pending` /
  `in-progress` / `blocked` / `complete` / `inconsistent` and rejects
  invalid states (e.g. `complete` with pending tasks, all-done but
  `in-progress`). Locks are derived: a phase is complete when every task under
  it is complete, and locked when it is also gate-proven and holds a closed
  review round or an effective waiver. `analyze` takes an optional `active`
  flag (a live session is bound) to split idle `pending` from active
  `in-progress`.
- **`Structure`** — `verifySpecTree` over an in-memory
  `SpecSnapshot`: required files, phase-directory placement, task-directory
  naming, id/name agreement, task-table agreement (name/type/status/gates), the
  record checks, dependency validity (existence, phase order, cycles), the
  strict `<PHASE>/<task>/<file>` allowlist, the version/untransformed check,
  channel grammar, and the review budget. Its review input is required
  (`NO_REVIEW` when the caller has no store), so every surface that verifies a
  tree also fails a series holding more rounds for a phase than that phase's
  budget.
- **`ReviewLink`** — the review-series convention: `seriesName`,
  `profileSeriesName`, `seriesNames`, `roundForPhase`, `roundPhase`,
  `reviewPhases`, `verify` (a complete review has its round),
  `verifyBudgets` (a series at or under its phase budget; over is
  `review.budget-exceeded`, and a round with no parsable attribution is the
  `review.phase-unattributed` warning), and `verifyDeferrals` (the
  `minor-deferred` closure and `review.deferred-severity`).
- **`ReviewPolicy`** — `decide` plus the text/JSON renderers behind
  `mf-specs review decide`: the ordered matrix, strictest-wins across series,
  the `minor-deferred` closure, and the bounded overflow.
- **`Prompt`** — `load(root, name, values)`: gate the shipped template on
  `mf-specs doctor`, read and verify it through `@montflow/prompts`, render it
  with the caller's values, and return the text plus the installed skills, the
  `SkillAdvisory` items for missing non-owned declared skills, and the decoded
  prompt. `PROMPT_NAMES` is `spec-create`, `spec-execute`, and `spec-sizing`, and
  the templates live only in `packages/specs/prompts/`. `parseMode` / `MODES`
  carry the public `guided` (default) and `autonomous` names.
- **`Scaffold`** — `renderSpecScaffold` / `ScaffoldSpecInput` /
  `ScaffoldTask`: pure renderer for a fresh spec tree (the mechanical
  half of `mf-specs create`), emitting each task's `size` and each review
  task's `reviewer-profiles` list.
- **`Sizing`** — the single size vocabulary (`SIZES`, `Size`, `isSize`,
  `DEFAULT_SIZE`), the review-cycle budget (`REVIEW_CYCLES`,
  `MAX_REVIEW_CYCLES`, `reviewCycles`, `taskContribution`,
  `phaseReviewBudget`), the coded verifier
  (`verify`, `verifyText`), the effectful `parse` with preserved cause, and the
  layered resolver (`LAYERS`, `merge`, `mergedEntry`, `resolve`, `targetOf`,
  `INHERIT`).
- **`Catalogue`** — the harness model catalogue: `normalize`, `filterProvider`,
  `findModel`, `toDocument` / `toJson`, `renderTable`, `decode`, and `verify`
  (`models.unknown-model` / `models.unknown-effort` findings plus the stable
  code list). The only normalizer the `models` command and the sizing flow use.
- **`Verify` / `Frontmatter`** — shared `Issue` / `Result` vocabulary and
  the tolerant frontmatter grammar.
- **`Diagnostic`** — `DiagnosticBlock`, `renderDiagnostic` /
  `renderDiagnostics`, and `causeMessage`: the one agent-first block
  (`code`, `path`, `field`, `problem`, `expected`, `actual`, `fix`,
  `next`, plus `cause`, `layers`, and `stack` under `--verbose`) every surface
  prints through, CLI and prompt advisories alike.
- **`SpecStore`** — filesystem reader (`names`, `hasRoot`, `exists`,
  `snapshot`, `reviewSeries`) backing the CLI. `reviewSeries` reads the review
  store beside the specs store (`<specs-root>/../reviews`) for the series a
  spec owns.
- **`Cli`** — pure engines (`check`, `status`, `list`, `sizingOf`, `models`,
  `listModels`, `verifyModels`, `author`,
  `execute`, `sizingConfig`, `resolveSizingScope`, `which`), pure renderers
  (`renderCheck`, `renderStatus`,
  `renderNext`, `renderList`, `renderSizing`, `renderSizingReport`,
  `renderModelFindings`, `renderWhich`), and the `effect/cli` commands.
  `renderDiagnostic` is `Diagnostic`'s, re-exported here.
- **`Doctor`** — `runDoctor(root)` / `runDoctorAt(startDir)` read the packaged
  `payload.json` and install or verify the spec skills, prompts, and rigors,
  reporting one outcome per artifact (`SPEC_SKILL_NAMES`, `SPEC_PROMPT_NAMES`,
  `SPEC_RIGOR_NAMES`). Repair mode refreshes a stale or mismatched artifact from
  the package bytes; `--check` writes nothing and performs no directory
  creation.

All verification is pure and non-throwing: it returns a `Result` with an
issue list, so callers can render or repair.

## Migration: multi-reviewer reviews

Multi-reviewer support adds an optional `reviewer-profiles` field to a review
task and one review series per declared profile. Existing specs and series need
no change: profiles are declared by the repo and optional per phase, and nothing
in this package recommends one.

1. **No declared profiles is unchanged.** A review task with no
   `reviewer-profiles` (absent, blank, or `[]`) dispatches one general reviewer
   into its existing series, exactly as before. A spec with no review series is
   skipped by the budget check, so a store that predates the review extension
   keeps verifying; the per-series link is enforced whenever a series exists.
2. **`reviewer-profiles: <a>, <b>` is additive.** Each declared profile adds a
   series named `<spec>-<profile>`, and the general reviewer always runs the
   default `<spec>` series alongside it — a profile joins, it never replaces the
   general reviewer. A phase's review lands on the same round number in every
   expected series.
3. **`finding-ref` is now a qualified locator.** A `defect` task's bare
   `finding-ref: F<n>` becomes `<series>/<round>/F<n>` (for example
   `ship-login/002/F2`). The accepted grammar is
   `/^[a-z0-9]+(?:-[a-z0-9]+)*\/\d{3}\/F\d+$/`. Rewrite each existing value
   once; there are none in this repo.
4. **Cross-spec series names can collide — accepted.** Because `-` both
   separates and occurs inside a slug, a profile series `<spec>-<profile>` can
   equal another spec's default or profile series (spec `foo` declaring profile
   `bar` composes `foo-bar`, the default series of a spec named `foo-bar`). No
   injective marker exists within the slug alphabet, and both the verifier and
   dispatch always hold the spec name, so this is accepted as a low-likelihood
   limitation.
5. **Per-round `Phase:` attribution is the binding.** Every spec-phase round
   records the phase it reviews (`- Phase: <phase>` in its `## Metadata`). A
   completed phase review is attributed to a round carrying that phase in every
   expected series, with the round number agreeing across series. The phase rank
   is the _preferred_ round number only: if an earlier phase's fix→re-review
   loop has taken it, the phase writes the next round free in every series. No
   empty or fabricated round is ever seeded, and a `pending` review task
   requires no round at all.

**Discovering profiles.** Before choosing `reviewer-profiles`, run
`mf-profiles list` (`/mf-profiles list` in the OpenCode host): the list pairs
every profile name with its description, which is the signal a reviewer choice
needs — never guess the store's contents. When a description does not settle
the choice, `mf-profiles show <name>` reports that profile's instructions and
review checklist. An empty `reviewer-profiles` list is the default on every
phase; each declared profile adds one review round per cycle without changing
the phase budget.

## Status

Early (`0.0.1`, private). Targets the v2 spec standard: the phase tree, derived
locks, rigor-aware authoring, gate execution, and the review-cycle policy.
Source-only — no build step: the OpenCode host loads the `.ts` files directly.
