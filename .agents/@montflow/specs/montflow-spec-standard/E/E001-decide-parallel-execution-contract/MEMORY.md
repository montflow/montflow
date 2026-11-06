# Memory

## Context

Decide the parallel-execution contract: a phase shape that maximizes the ready set, a write-scope rule, a two-layer gate split, a single-flight scheduler over C002's `gate run`, and the C003 board/mailbox protocol. E002 implements the scheduler; E003 teaches the shape, channels, and scheduler. Bound E001 only.

## Progress

- 2026-11-03: bound with `claim --name montflow-spec-standard --task E001`.
- Read TASK.md, the phase brief, `packages/specs/README.md`, `gates`, `channel`, `structure`, `task`, `cli.gate`, `cli.status`, `cli.mail`; wrote no source.
- Scoped check before and after: `check --name montflow-spec-standard` (0 issues).

## Findings

**Contract (normative).** Only C002's `gate run`/`gate record`/`GATE-RESULTS.jsonl` and C003's `mail`/`BOARD.md`/`MAILBOX.md` exist. Every rule below extends one of those verbs or files; none adds a command, scheduler, channel, or result-record family — the only new file is the optional `gate.json` config in C7.

**C1 Phase shape.** Author the widest ready set: tasks are independent unless a real data/ordering dependency exists, and `depends-on` carries only that edge. Enforced by the authoring skill (`montflow-create-specs` + `spec-create`, E003) = judgment. Detectable serial chain = a v2 phase with >=3 non-review tasks where each non-review task's `depends-on` is exactly the previous one; it states why in `PHASE.md` `serial-reason: <one line>`, else `check` reports `phase.serial-chain-unexplained` (warning, `--strict` promotes).

**C2 Write scope.** `TASK.md` frontmatter `write-scope:` = comma-separated list; each token is `none` or a repo-root-relative POSIX path, optional trailing `/` for a subtree, no leading `/`, no `..`, no glob, no whitespace; `.` = whole repo. The task directory is implicit and never declared. A pending non-review task with no field = `task.write-scope-missing` (warning); `review`/complete tasks default `none`. `check` reports `phase.write-scope-overlap` (error) when two non-complete tasks in one phase declare overlapping scopes and neither is reachable from the other by `depends-on`; overlap = equal path or one prefix at a `/` boundary, `none` never overlaps. Fix = add the edge or split. Overlap the paths cannot express is judgment (author/reviewer). `new-task`/`init`/`create` generate the field (E002).

**C3 Two gate layers.** Task `GATES.md` = task-local; phase `GATES.md` = phase-shared, run once at the phase boundary by the orchestrator. A mechanical stage may carry `scope:` (C2 path grammar, plus `repo`) and `lane: heavy|light`. Absent `scope` = the owner's scope (task `write-scope`; phase `repo`); absent `lane` = `heavy`. `check`: `gate.shared-check-in-task` (task stage scope not contained in the task's `write-scope`, including `repo`), `gate.duplicate-command` (the same normalized command with overlapping scope in two gate files of one spec), `gate.scope-missing` (an unfinished v2 mechanical stage with no resolvable scope). A task gate never copies a repo-wide suite; a shared check is named once, in the phase gate.

**C4 Run key.** `key = "gate-v1:" + sha256hex(canonical)` where `canonical = normCommand + "\n" + scopes.join(",") + "\n" + fingerprint`. `normCommand` = trim and collapse every whitespace run to one space, no shell or env expansion. `scopes` = sorted unique tokens (`repo` or a C2 path); a phase-boundary scope normalizes to `repo`. `fingerprint = sha256hex` over the sorted stream of `path + NUL + sha256hex(bytes) + "\n"` for every regular file inside the scopes, excluding `.git/`, `node_modules/`, `.turbo/`, `dist/`, `build/`, `coverage/`, `.agents/@montflow/.runtime/`, and every `GATE-RESULTS.jsonl`; a symlink contributes its target string. Task, phase, stage, and session ids never enter the key. `gate run --scope <token[,…]|repo>` overrides a stage's `scope:` for that invocation and so its key.

**C5 Record shape.** `gate run` appends one record per stage per requester to the owner's `GATE-RESULTS.jsonl`; new keys are optional on read, required on write. Mechanical: `{stage,title,kind:"mechanical",command,scope:[…],key,fingerprint,owner:<session>,exit,verdict,at,durationMs,lane,waitedMs,reused:<bool>,source?:<original at>,output}`. Subjective is unchanged, plus `key`/`scope`/`fingerprint` when its stage declares `scope`. Run state lives only at `.agents/@montflow/.runtime/runs/<sha256(key)>.json`: `{version:1,key,command,scope,fingerprint,state:"waiting|running|passed|failed|cancelled|timeout|expired",lane,attempts:[{owner:{session,task,pid},startedAt,heartbeatAt,leaseExpiresAt,finishedAt?,exit?,durationMs?}],waiters:[session],resultPath,resultIndex}`. One `runs.lock` (the `withClaimsLock` primitive) guards transitions; every write is temp-then-rename.

**C6 Single flight, reuse, invalidation.** At most one `running` attempt per key. A second requester registers as a waiter, prints `waiting key <key> · lane <lane> <inflight>/<lanes> · position <n> · owner <task>`, and consumes the outcome; it never spawns. A `passed` key is reused while the key (hence fingerprint) is unchanged: append a `reused:true` record and print `reused <key> from <path> @ <at>`. Any input change yields a new key, so the old pass cannot be consumed. A `failed`/`timeout`/`cancelled` result is never reused as a pass; a later request reruns it, while waiters of the same attempt consume it. `--no-reuse` forces a run. `check` = `gate.stale-result` (error: a pass whose recomputed key differs, or whose recorded scope does not cover the stage's declared scope) and `gate.result-unkeyed` (warning on an unfinished owner's pass with no `key`; **error** on a complete owner whose stage declares a `scope:` — only a legacy stage with no declared scope stays exempt). A pass whose stored key/fingerprint differs from the recomputed one, or whose exit/verdict disagree (`gate.result-inconsistent`), is a fabricated green and is rejected.

**C7 Bounded lanes.** Config `<workspace>/.agents/@montflow/gate.json`, all keys optional: `{"heavy":{"lanes":1,"inFlight":2},"leaseSeconds":60,"heartbeatSeconds":10,"waitTimeoutSeconds":900}` — those are the defaults. `heavy` = test, typecheck, build, lint, fmt, or a repo/package-wide `check`/gate, or an explicit `lane: heavy`; `light` = a single-file check or `lane: light`. Light never waits on the heavy lane but counts toward `inFlight`. A waiter whose `waitTimeoutSeconds` expires exits `gate.wait-timeout` non-zero without running. Added flags: `--scope`, `--lane heavy|light`, `--no-reuse`, `--lanes <n>`, `--in-flight <n>`, `--wait-timeout <s>`; `--lanes`/`--in-flight` override the file and `<1` is refused.

**C8 Lease and recovery.** The owner writes `heartbeatAt` every `heartbeatSeconds`; `leaseExpiresAt = heartbeatAt + leaseSeconds`. A requester that finds an attempt past `leaseExpiresAt` (or a dead `pid`, or a released claim for its session) marks it `expired`, appends no result, and starts attempt n+1 under the same key, printing `reclaimed <key> attempt <n+1>`. A crashed worker can never block a key. SIGINT and `--timeout` record `state: cancelled|timeout`, `verdict:"fail"`, `exit:130|124` — never a pass.

**C9 Channel protocol (C003 unchanged).** `BOARD.md` = broadcast facts (`to all`, only `mf-specs mail --to all`): phase boundary, shared gate ran/reused, dependency closed, lane config. `MAILBOX.md` = targeted question/answer, one task addressee; the orchestrator is the sole sender, so a worker's question travels in its receipt and the orchestrator may record the question and the answer there. A live target is steered, an absent one queues and is read at start. Workers read the board and their mailbox at start and before the receipt. A channel never substitutes for `depends-on`: a real sibling need becomes an edge, and the worker stops and reports it.

**C10 Visibility.** `next`: task line appends `gate task-local <scope>`; phase head appends `phase-gate <kind> <scope> · shared once at boundary`. `gate run`: per stage `key <key> · scope <scope> · lane <lane> <inflight>/<lanes> · waited <ms> · ran|reused <source> · fingerprint <fp>`, after any `waiting …` line. `status`: `runs <n> in-flight · <n> queued · <n> stale`, then `run <key> <lane> <inflight>/<lanes> <task> <state> <elapsed>`. `check` names `gate.stale-result` with owner, stage, stored and current fingerprint.

**C11 Enforcement map.** C1 authoring skill (judgment) + `check` warning; C2 `check` + the generator verbs; C3 `check` + `next`; C4/C5 `gate run` (writer) and `check` (reader); C6 `gate run` + `check`; C7/C8 `gate run`; C9 `mail` + the authoring/execution profiles (read points and dependency substitution are judgment); C10 `next`/`gate run`/`status`/`check`.

## Gates

- No task `GATES.md`; ran no official gate. Evidence: `check --name montflow-spec-standard` exit 0, `1 spec · 0 failed · 0 issues` before and after; full log `/tmp/E001.log`.

## Open Questions

- None blocking. E002 may promote `task.write-scope-missing` to an error once the generators write the field everywhere; until then it stays a warning.

## Handoff

- E002 implements C2–C8 and C10 inside `gate run`, `check`, `next`, `status`; no new verb. E003 teaches C1, C2, C3, C9 and the `gate run` flow in the skill, prompts, and profiles. Full contract above; log `/tmp/E001.log`.

## Deviations

- None.
