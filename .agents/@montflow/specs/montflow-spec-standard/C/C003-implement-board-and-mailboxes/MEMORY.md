# Memory

## Context

C003 implements B004 F8/B005 F1's communication channels: the phase `BOARD.md`
broadcast and the per-task `MAILBOX.md` targeted mail, both append-only with one
entry grammar the verifier parses. It also lands `mail --to <task-id|all>
--text <text> [--phase <id>] [--session <session-id>]` as the only channel
writer: the caller must hold the spec's orchestrator binding, the sender is
derived from that binding (there is no `--from`), and write-then-steer means a
live target is steered while an absent one queues for task start. `claim` is
C005's; this task only consumes C002's `readClaims`/`holdsOrchestrator` registry
reader and adds the shared clock helper `stamp` will be built on.

In scope: `packages/specs` source/tests, the shipped `spec-execute` prompt, its
embedded payload, and its installed copy. Out of scope: the `claim` verb
(C005), slash/TUI parity (C008), docs/ledger (C007), the real exec-skill file
packaging (C006).

## Progress

- 2026-11-03: read `TASK.md`, `GATES.md`, this `MEMORY.md`, B004 F8/F9, B005
  F1's `mail`, C002's handoff, the existing gate/structure/phase modules, and
  the installed `spec-execution-orchestrator` profile.
- 2026-11-03: added `modules/stamp` (`ISO_INSTANT_PATTERN`, `instant`,
  `stampNow`, `isInstant`) and pointed `gates` at the one clock format.
- 2026-11-03: added `modules/channel` with the B004 heading grammar, the
  `board.*`/`mail.*` codes, `parseChannel`, `verifyChannel`,
  `renderChannelEntry`, and `appendChannelEntry`.
- 2026-11-03: wired channel verification into `verifySpecTree`, so `check`
  rejects a malformed entry and an unknown addressee with `line` and
  `field: "<file>:<line>"`.
- 2026-11-03: added `mail` (`cli.mail.module.ts`) with orchestrator authority,
  addressee-first validation, write-then-steer, the `SessionSteerPort` seam,
  and the OpenCode `session.prompt` default port; wired it into the root CLI.
- 2026-11-03: taught `spec-execute` the board/mailbox protocol and the
  "a channel never substitutes for `depends-on`" rule; regenerated the embedded
  payload and repaired the installed copy with `doctor`.
- 2026-11-03: added module, CLI, check-integration, and prompt-guidance tests
  and ran every gate from the repo root.

## Findings

### Channel grammar and verification

- `modules/channel/channel.module.ts` exports `BOARD_FILE`, `MAILBOX_FILE`,
  `CHANNEL_ENTRY_PATTERN`, `CHANNEL_CODES`, `parseChannel`, `verifyChannel`,
  `renderChannelEntry`, `appendChannelEntry`, and `bodyBreaksGrammar`.
- The heading regex is B004's exactly: UTC second-precision instant, U+00B7
  middle dot with single spaces, `from <task-id|orchestrator>`, `to <all|task-id>`.
  The ISO pattern uses non-capturing groups so the composed regex groups stay
  `instant`, `from`, `to`.
- `parseChannel` returns `{at, from, to, body, line}` per entry and reports:
  malformed title, malformed entry, empty body, out-of-order timestamp, and
  stray content. Every finding carries `line` and `field: "<file>:<line>"`
  (`BOARD.md:3` / `MAILBOX.md:3`) and repeats the line in `problem`.
- `verifyChannel` adds the target rules: a board entry must address `all` and
  its author must be `orchestrator` or a task in the spec; a mailbox entry must
  address a known task, the file's owner, and not itself, and its sender must be
  known. Unknown addressees are named (`'Z999'`) in the message.
- `appendChannelEntry` creates `# Board` / `# Mailbox` when missing and always
  keeps the previous bytes as a prefix. The writer refuses to append to a
  channel whose existing content fails this grammar.
- `verifySpecTree` now collects every `BOARD.md`/`MAILBOX.md` while reading the
  tree and verifies them after all task ids are known, so a cross-phase author
  or recipient is judged against the whole spec, not a partial map.
- No existing spec in the store holds a channel file; `mf-specs:check` still
  reports `14 specs · 0 failed · 0 issues`.

### `mail`

- `sendMail` is the engine; `mailCommand` is the CLI. Authority is the same
  check as `gate run`: `readClaims` + `holdsOrchestrator` against
  `.agents/@montflow/.runtime/claims.json`. A worker caller is
  `mail.not-orchestrator`; no channel file is created or changed.
- The sender is always `orchestrator` and is never a flag. The CLI's help and an
  actual `--from` invocation both show there is no such option.
- Recipient resolution happens before any write: `all` resolves to the named
  phase board, or to the first phase with unfinished work (last phase once all
  are complete); a task id must exist and, when `--phase` is supplied, belong to
  that phase. Refusals: `mail.unknown-recipient`.
- Body validation: blank is `mail.empty-entry`; a line beginning `## ` is
  `mail.malformed-entry`, because it would start another entry. Both refuse
  before writing.
- Existing-file validation: any grammar/addressee finding refuses the append
  with that finding's own code (for example `mail.malformed-entry`, with the
  offending line). Mail never repairs a corrupt channel.
- Delivery: the entry is written first, then a task target with a claim binding
  is steered through `SessionSteerPort`. Success is `delivered-live <session>`;
  a failed steer leaves the entry and reports `mail.steer-failed` (warning) with
  `queued`. A target with no binding is `queued`; `all` is never steered.
- The CLI's default port runs `opencode api POST /api/session/<id>/prompt`, so
  the host owns delivery. `sendMail` takes the port as an injected option; tests
  use a recording fake, and the CLI demonstration uses a PATH shim, never a live
  user session.
- `mail` writes only the channel file. Tests assert the task `TASK.md` and the
  claim registry are byte-identical before and after.
- If the clock is behind the last existing entry (system skew or a test clock),
  `mail` keeps the last stamped instant so it can never append an out-of-order
  entry; the verifier's ordering proxy stays true.

### Shared clock

- `modules/stamp` is the one instant source: `ISO_INSTANT_PATTERN`,
  `ISO_INSTANT_SOURCE` (unanchored for composition), `instant(millis)`,
  `stampNow` (`Clock.currentTimeMillis` mapped through `instant`), and
  `isInstant`.
- `gates` now imports the same pattern and re-exports `instant` from `stamp`,
  so C005 can build `stamp` on `stampNow` without a second time format.
- `mail` has no timestamp option; every entry's `at` comes from `stampNow`.

### Execution guidance

- `packages/specs/prompts/spec-execute.json` §2 now states: workers read the
  phase `BOARD.md` and their own `MAILBOX.md` at task start and before their
  receipt; the orchestrator writes with `mf-specs mail --name <spec> --to
  <task-id|all> --text <text> [--phase <id>]`; the sender is derived from the
  binding; live targets are steered and absent ones queue; and a channel never
  substitutes for a dependency edge — a mid-flight sibling need becomes a
  `depends-on` edge, not a mailbox thread.
- A test reads the package prompt and fails if `BOARD.md`, `MAILBOX.md`,
  `mf-specs mail --name`, or `depends-on` disappears.

## Gates

All commands run from the repo root on 2026-11-03. Logs are under
`/tmp/opencode/c003-gates/final2-*.log`; excerpts are verbatim.

### `bun run --cwd packages/specs test -- --run`

Exit code: 0.

```
 Test Files  112 passed (112)
      Tests  1567 passed (1567)
Type Errors  no errors
```

New coverage: `src/modules/channel/tests/channel.test.ts` (entry fields,
malformed title/entry/body, stray content, out-of-order, board target/author,
mailbox unknown sender/recipient/mismatch/self-addressed, renderer and
append-prefix), `src/apps/cli/tests/channel-check.test.ts` (malformed board and
unknown addressee through `check`), `src/apps/cli/tests/mail.test.ts` (live
steer, queue, steer failure, worker refusal, unknown addressee, board, append +
stamp, clock-skew ordering, malformed-existing refusal, only-channel-writes,
grammar-breaking body, active-phase derivation, prompt guidance), and
`src/modules/stamp/tests/stamp.test.ts` (format, strictness, `stampNow`).

### `bun run mf-specs:check`

Exit code: 0.

```
14 specs · 0 failed · 0 issues · 14 warnings
✓ spec skills and prompts are installed and up to date.
✓ spec-execute: up to date → /home/daniel/dev/montflow/spec-standard/.agents/@montflow/prompts/spec-execute.json
```

The 14 warnings are the existing one-per-spec `spec.version-outdated` warnings.
This run also proves every existing spec still verifies with the new channel
checks, and that the embedded payload and installed prompt copy match.

### `bun run ts:check`

Exit code: 0.

```
 Tasks:    17 successful, 17 total
Cached:    14 cached, 17 total
  Time:    675ms
```

### `bun run lint:check`

Exit code: 0.

```
@montflow/specs:lint:check: Found 0 warnings and 0 errors.
 Tasks:    17 successful, 17 total
```

### `bun run fmt:check`

Exit code: 0.

```
@montflow/specs:format:check: All matched files use the correct format.
 Tasks:    17 successful, 17 total
```

## Completion evidence

A throwaway workspace was built at `/tmp/opencode/c003-demo` with one v2 spec
(`demo-spec`, phase A, tasks A001 and A002), a registry holding `sess-orch` as
`orchestrator` and `sess-worker` bound to A001, and a PATH shim at
`/tmp/opencode/c003-bin/opencode` that records its argv and exits 0. The shim is
the stand-in host server: no live user session was ever steered.

### Live delivery steers the bound session

Command:

```
PATH=/tmp/opencode/c003-bin:$PATH OPENCODE_SESSION_ID=sess-orch \
  bun run --cwd packages/specs cli mail --dir /tmp/opencode/c003-demo \
  --name demo-spec --to A001 --text 'Gate runner landed; re-run it before your receipt.'
```

Output:

```
✓ delivered live sess-worker · A/A001-implement/MAILBOX.md
EXIT=0
```

The shim log shows the target session and the exact entry text:

```
api POST /api/session/sess-worker/prompt --data {"text":"## 2026-11-03T13:05:07Z · from orchestrator · to A001\n\nGate runner landed; re-run it before your receipt.\n"}
```

The mailbox holds the entry:

```
# Mailbox

## 2026-11-03T13:05:07Z · from orchestrator · to A001

Gate runner landed; re-run it before your receipt.
```

### Queueing to a non-live task, read at task start

A002 has no claim binding:

```
$ ... mail --name demo-spec --to A002 --text 'Read at task start: the fixture is ready.'
✓ queued · A/A002-verify/MAILBOX.md
The target is not live; it reads this entry at task start.
EXIT=0

$ cat A/A002-verify/MAILBOX.md
# Mailbox

## 2026-11-03T13:05:27Z · from orchestrator · to A002

Read at task start: the fixture is ready.
```

The steer log still held only the A001 call, so an absent target is never
steered. The spec-worker profile already says step 1 reads its own
`MAILBOX.md`; this entry is what that step reads.

### A worker cannot send mail

```
$ OPENCODE_SESSION_ID=sess-worker ... mail --to A002 --text '...'
code     mail.not-orchestrator
problem  Session 'sess-worker' does not hold the orchestrator binding for 'demo-spec'.
EXIT=1
```

No mailbox entry was written by that call.

### The sender is derived; no `--from`

```
$ ... mail --to A001 --from orchestrator --text nope
ERROR
  Unrecognized flag: --from in command mf-specs mail
EXIT=1
```

Every written heading reads `from orchestrator`, produced from the binding, not
from input.

### Unknown addressee is refused before writing

```
$ ... mail --name demo-spec --to Z999 --text 'Hello?'
code     mail.unknown-recipient
problem  Task 'Z999' does not exist in spec 'demo-spec'.
EXIT=1
```

No `Z999` directory or mailbox was created.

### Append-only and stamped

The mailbox was copied before a second send, then compared:

```
$ cmp -n "$(stat -c%s mailbox-before.md)" mailbox-before.md MAILBOX.md
CMP_EXIT=0
```

The file then held both entries, with the older bytes unchanged:

```
# Mailbox

## 2026-11-03T13:05:07Z · from orchestrator · to A001

Gate runner landed; re-run it before your receipt.

## 2026-11-03T13:05:16Z · from orchestrator · to A001

Second entry: the gate output is in GATE-RESULTS.jsonl.
```

Both timestamps were produced by `stampNow`; `mail` has no flag that accepts a
timestamp.

### A malformed board entry is rejected with the offending line

`A/BOARD.md` was set to:

```
# Board

## this is not an entry heading

Body text.
```

`check` output:

```
✗ demo-spec (1 issue · 1 warning)
  code     board.malformed-entry
  path     demo-spec/A/BOARD.md
  field    BOARD.md:3
  problem  Board entry heading does not match '## <instant> · from <task-id|orchestrator> · to <all>'. (line 3)
  expected ## 2026-11-02T21:15:00Z · from <task-id|orchestrator> · to <all|task-id>
  actual   ## this is not an entry heading
  fix      Write the entry with `mf-specs mail`; never hand-edit a channel entry.
  next     mf-specs check --name demo-spec

1 spec · 1 failed · 1 issue · 1 warning
EXIT=1
```

### An unknown addressee is rejected by name with the offending line

`A/A002-verify/MAILBOX.md` was set to an entry addressed `to Z999`:

```
✗ demo-spec (1 issue · 1 warning)
  code     mail.unknown-recipient
  path     demo-spec/A/A002-verify/MAILBOX.md
  field    MAILBOX.md:3
  problem  Mailbox entry addresses unknown task 'Z999'; no task with that id exists in this spec. (line 3)
  expected a task id declared in this spec
  actual   Z999
  fix      Address the task the mailbox belongs to.
  next     mf-specs check --name demo-spec

1 spec · 1 failed · 1 issue · 1 warning
EXIT=1
```

### Broadcasts and a clean final tree

```
$ ... mail --name demo-spec --to all --phase A --text 'Board entry: A002 stays queued until it starts.'
✓ queued · A/BOARD.md
Every worker reads the board at task start.
EXIT=0

$ check --name demo-spec
✓ demo-spec (1 warning)
  ! phase.review-task-missing × 1 · demo-spec/A/PHASE.md

1 spec · 0 failed · 0 issues · 1 warning
EXIT=0
```

The remaining warning is the demo phase having `review: required` and no review
task; it is unrelated to the channels, and the valid board + mailbox produce no
finding.

### Prompt / payload

`packages/specs/prompts/spec-execute.json` now names the board, the mailbox,
`mf-specs mail --name <spec> --to …`, and the dependency rule. The payload was
regenerated with `bun run --cwd packages/specs generate:payload`, and
`bun run --cwd packages/specs cli doctor --dir $PWD` repaired the installed copy;
`mf-specs:check` reports both up to date.

## Open Questions

- None blocking.
- Non-blocking: the default live-delivery port shells out to
  `opencode api POST /api/session/<id>/prompt`. That route is the host's public
  session-input surface (it is the same `session.prompt` operation the plugin
  port wraps), but it is external to `packages/specs`; if the host renames it,
  a live steer becomes `mail.steer-failed`/`queued` and the durable entry still
  reaches the worker. C008 may want to replace the subprocess seam with an
  injected host port on the slash/TUI surface.

## Handoff

- C005: build `stamp` on `modules/stamp`'s `stampNow`/`instant`/
  `ISO_INSTANT_PATTERN`; the registry reader is unchanged. `mail` already calls
  `holdsOrchestrator` exactly as `gate run` does, so `claim --orchestrator` is
  the only missing half of the live-delivery path.
- C006: `spec-execute.json` carries the channel protocol; the real
  `spec-worker`/orchestrator payload packaging should keep the two sentences
  "workers read BOARD/MAILBOX at start and before receipt" and "a channel never
  substitutes for `depends-on`".
- C007: the `mail` verb is discoverable from `mf-specs mail --help`; docs were
  not updated here.
- C008: `mail` is a CLI subcommand only and is not in `SLASH_COMMANDS`; slash
  and TUI parity remain C008's work.

## Deviations

- Added `modules/stamp` rather than a second instant helper inside `channel`:
  the task explicitly asks for a shared clock helper C005 can build `stamp` on.
  `gates` now re-exports `instant` from it; the gate record shape is unchanged.
- Added `mail.write-failed` (no B004 name) for a filesystem write failure and
  reused the verifier's codes for malformed-existing/channel-body refusals; the
  spec names the verifier codes, not every writer-only failure.
- No `BOARD.md`/`MAILBOX.md` were written into this spec: the phase has no
  board, and this run's write scope is limited to this task's `MEMORY.md` plus
  source/tests/prompt/payload.
- Pre-existing working-tree changes to `SPEC.md`, the C001/C002/C004 records,
  `phase.module.ts`, and their tests were present before this run and were not
  touched.

## Orchestrator Verification (2026-11-03)

Independent gate run from the repo root after the worker receipt:

```
$ bun run --cwd packages/specs test -- --run
 Test Files  112 passed (112)
      Tests  1567 passed (1567)
Type Errors  no errors
EXIT=0

$ bun run mf-specs:check
14 specs · 0 failed · 0 issues · 14 warnings
EXIT=0

$ bun run mf:gate:fast   # lint:check + fmt:check + ts:check + mf:check
 Tasks:    17 successful, 17 total   (lint)
 Tasks:    17 successful, 17 total   (format)
 Tasks:    17 successful, 17 total   (ts)
summary entries=14 issues=0 warnings=0
summary checks=8 failed=0 repaired=0
EXIT=0
```

The task reports the completion demos (malformed and unknown-addressee entries
rejected with line numbers, live steering of a fake bound session, non-live
queueing readable at start, append-only byte prefix, stamped timestamps,
`mail.not-orchestrator`, and no `--from`). All completion items are supported;
task recorded complete by the orchestrator.
