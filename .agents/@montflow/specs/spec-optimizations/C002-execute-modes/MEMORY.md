# Memory

## Context

C002 `execute-modes`: give the execute prompt two interaction modes under the
public names `guided` (default) and `autonomous`, while the policy stays
`supervised` / `unsupervised` internally and the template variable stays
`unsupervised` (the template grammar has no string comparison). The mode changes
interaction only: dispatch order, `depends-on`, gates, phase review, locking, and
verification are identical in both.

Worktree `/home/daniel/dev/montflow/spec-optimizations`, branch
`feat/spec-optimizations`. Depends on C001 (shipped prompt templates + loader).

In scope: the execute prompt's mode section, its description and variable
descriptions, the loader's `mode` → `unsupervised` mapping and rejection, and
tests for both branches plus the guided default. Out of scope and untouched:
`author` / `execute` CLI commands (C003), README/profile/skill docs (C005),
`SPEC.md`, task statuses, locks, profiles, and other task records. No git commit.

## Progress

Done.

Files modified:

- `packages/specs/src/modules/prompt/prompt.module.ts` — added the interaction
  mode contract and wired it into the loader:
  - `MODES = ['guided', 'autonomous']`, `Mode`, `DEFAULT_MODE = 'guided'`,
    `MODE_HINT`, `MODE_FLAG = '--mode'`.
  - `POLICIES = { guided: 'supervised', autonomous: 'unsupervised' }` for docs
    and diagnostics only.
  - `UNSUPERVISED_VARIABLE = 'unsupervised'`, `UNSUPERVISED_VALUES` (blank for
    guided, non-empty for autonomous), `unsupervisedOf`.
  - `parseMode(value)`: omitted/blank → guided; exactly the two public names
    accepted, case-sensitive; anything else is a coded `ModeRefusal`.
  - `applyMode(variables, values, mode)`: drops the reserved `mode` key and
    folds the public mode into `unsupervised` only for a prompt that declares
    it; a direct internal `unsupervised` value passes through when no `mode`
    was supplied.
  - `CODES.mode = 'prompt.mode'`; `load` validates the mode after decoding the
    prompt and before required-value checks, so an unknown value fails as a
    `PromptError` (`field: 'mode'`, the installed path, both public names in
    `expected`, and a `--mode guided|autonomous` fix) instead of rendering.
- `packages/specs/prompts/spec-execute.json` — canonical prompt:
  - `description` now names `--mode guided` (default) and `--mode autonomous`
    and states what autonomous asks for and records.
  - Section 1 states that beginning a spec with no started task and resuming one
    in progress are the same job, driven by `state` and `next`.
  - Section 8 rewritten: public `--mode` values first; autonomous asks only for
    destructive/irreversible actions, very dangerous tool calls, or decisions
    it genuinely cannot make, and records every other decision in the task or
    spec `MEMORY.md`; guided asks whenever a decision benefits, confirms
    destructive actions, and narrates with `notify_user`; shared prose fixes
    dispatch, `depends-on`, gates, review, locking, and verification in both.
  - `unsupervised` variable description explains the `--mode` derivation; it
    stays optional.
- `packages/specs/src/modules/prompt/tests/prompt.test.ts` — 16 cases (12 loader,
  4 pure): guided render omits autonomous-only instructions, autonomous render
  includes all three ask-only cases and `MEMORY.md`, both renders carry the
  shared dispatch/gate/review/locking rules, omitted mode defaults to guided,
  both public modes map onto the flag, the public mode overrides a stale
  internal flag, and each of `autopilot`, `Guided`, `supervised`,
  `unsupervised` fails `prompt.mode`.
- `packages/specs/src/modules/prompt/CONTEXT.md` — added the mode contract to
  "Belongs here" and a rule: mode is an interaction switch, not a policy
  switch.
- `.agents/@montflow/prompts/spec-execute.json` — repaired by
  `mf-specs doctor`, never hand-edited; byte-identical to the package file.
- `packages/specs/src/apps/doctor/embedded-payload.generated.ts` — regenerated
  with `bun run --cwd packages/specs generate:payload` after the prompt edit.

## Findings

### Naming decision (owned here; C003 and C004 consume it)

Chosen pair: **`guided` / `autonomous`**, with `guided` as the default.

Rejected alternatives:

- **`attended` / `unattended`** — describes whether a human is watching, not
  whether the agent may decide alone; `attended` reads like a session status,
  not a policy. An unattended run is not automatically allowed to act.
- **`copilot` / `autopilot`** — product metaphors. `copilot` implies a second
  agent pairing with the worker rather than a human in the loop; `autopilot`
  implies full delegation, which is exactly what autonomous still refuses
  (destructive, very dangerous, undecidable calls).
- **`interactive` / `headless`** — `headless` names a transport (no TTY), not a
  permission policy, and `mf-specs execute` is never headless: it always
  renders and prints or returns the prompt.
- **`human-in-the-loop` / `human-on-the-loop`** — accurate but long, hyphenated,
  and hostile as flag values; `human-on-the-loop` also implies monitoring an
  always-running agent, which is not the contract.

Why `guided` / `autonomous` won: two lowercase single words with no hyphen,
usable unchanged after `--mode` and in prose (`Guided run`, `Autonomous run`);
each names the agent's behaviour rather than the human's presence or a
transport; `autonomous` already matches the SPEC rule's own word, and `guided`
does not overpromise attention the way `attended` does.

Internal names stay `supervised` / `unsupervised`; the CLI and every public
surface accept only the public pair, and the template variable stays
`unsupervised`.

### Loader is the one place a mode is interpreted

`Prompt.load(root, name, values)` reads an optional reserved `mode` key in
`values` (it is not a template variable), validates it, and folds it into
`unsupervised` when the prompt declares that variable. That means C003's
`execute` and D003's `sizing-config` get rejection and mapping for free by
passing `mode` through, instead of restating the pair. A prompt without
`unsupervised` (`spec-create`) ignores a valid mode and never sees the key.

### Rejection detail

`prompt.mode` is a new member of the existing prompt codes, so one diagnostic
shape covers every prompt failure. Example for `--mode autopilot`: `path` is the
installed `spec-execute.json`, `field` is `mode`, `expected` is
`one of guided, autonomous`, `actual` is `autopilot`, and `fix` is
`Pass --mode guided or --mode autonomous, or omit --mode for guided.` Internal
names (`supervised`, `unsupervised`) are refused exactly like invented ones.

### TASK completion evidence (verbatim)

`mf-prompts inspect spec-execute` — the description explains both public modes
and the table marks `unsupervised` optional (`REQUIRED no`):

```
$ bun run --cwd packages/prompts cli inspect spec-execute --dir "$PWD"
spec-execute — Execute one spec phase by phase: load the derived state and ready set, dispatch workers, prove gates, hold the review-cycle budget, and lock each phase. `--mode guided` (the default) keeps the human in the loop; `--mode autonomous` asks only for destructive, very dangerous, or genuinely undecidable calls and records every other decision in MEMORY.md.
  model     (none)
  skills    montflow-find-specs, montflow-adversarial-review, montflow-addressing-adversarial-review
  variables 7 (4 required, 3 optional)

  NAME                                TYPE      REQUIRED  DEFAULT  VALUE
  ──────────────────────────────────  ────────  ────────  ───────  ─────
  name (Spec)                         text      yes       —        —
  state (Derived state)               textarea  yes       —        —
  next (Ready set)                    textarea  yes       —        —
  reviewBudget (Review-cycle budget)  text      yes       —        —
  phase (Phase)                       text      no        —        —
  focus (Focus)                       text      no        —        —
  unsupervised (Autonomous)           text      no        —        —

Missing required values: name, state, next, reviewBudget
  Supply them as key=value pairs, or set "required": false in the prompt file.
```

Guided render — dispatch, gates, review, locking, and verification present;
guided branch only, no autonomous instructions:

```
$ bun run --cwd packages/prompts cli render spec-execute --dir "$PWD" \
    name=spec-optimizations "state=in-progress · C phase" \
    "next=C002-execute-modes ready" reviewBudget=3 | grep -nE "Guided run|Autonomous run|Dispatch the ready set|depends-on|Mechanical gates|review|locking|verification"
18:## 2. Dispatch the ready set
20:Dispatch one subagent per ready task with the `subagent` tool: the worker behaves as the `spec-worker` profile, or the specialist named in the task's role when it has one. Tasks with no shared dependency run concurrently; tasks joined by `depends-on` wait. Never dispatch a task the ready set does not list.
22:Every ready line in `next` carries the task's size, resolved dispatch target, and winning source layer. …
28:- Mechanical gates: run them with `mf-specs gate run` and record the output verbatim.
29:- Subjective gates: dispatch the reviewer the gate names; the verdict is the evidence.
30:- Review: dispatch `montflow-adversarial-review` for a phase whose review is required; a waived phase skips it. Apply its findings with `montflow-addressing-adversarial-review`.
32:## 4. Stay inside the review-cycle budget
34:This phase's review-cycle budget is 3. …
36:A cycle is one reviewer round, not a per-finding attempt: …
38:At the cap, do not open another round. …
42:Ask the review round for `pass | rework | escalate`.
46:- `escalate` -> `ask_user`. Never guess a decision that belongs to the user, and never lock a phase the review did not pass.
50:`BOARD.md` is broadcast: … Communication never substitutes for a dependency edge: … add the `depends-on` and refuse the conversation.
61:Guided run (the default): the human is present and feedback is welcome. Ask whenever a decision would benefit from it, confirm destructive actions before taking them, and narrate progress with `notify_user`.
63:Mode changes interaction only. Dispatch order, `depends-on`, gates, phase review, locking, and verification are identical in both modes: never skip a gate, widen a review waiver, or relax verification because the mode is autonomous.
```

Autonomous render — the three ask-only cases and the `MEMORY.md` record, no
guided branch:

```
$ bun run --cwd packages/prompts cli render spec-execute --dir "$PWD" \
    name=spec-optimizations "state=in-progress · C phase" \
    "next=C002-execute-modes ready" reviewBudget=3 unsupervised=autonomous | grep -nE "Guided run|Autonomous run|Ask only for|destructive|dangerous tool|genuinely cannot|MEMORY.md|Mode changes interaction only"
26:Workers return receipts and write only their own `MEMORY.md`. Never mark a task complete from its claim alone:
38:At the cap, do not open another round. …
61:Autonomous run: do not ask for ordinary decisions. Ask only for:
63:- a destructive or irreversible action — a force push, deleting work, a schema migration, rewriting history;
64:- a very dangerous tool call;
65:- a decision you genuinely cannot make from the spec and the evidence.
67:Every other decision is yours: decide it from the spec and the evidence, state it in one line, and record it in the task's `MEMORY.md` or, when it spans tasks, the spec's `MEMORY.md`. Never ask for confirmation of an ordinary step just to be safe.
69:Mode changes interaction only. Dispatch order, `depends-on`, gates, phase review, locking, and verification are identical in both modes: never skip a gate, widen a review waiver, or relax verification because the mode is autonomous.
```

(`…` elisions above are long lines repeated from the guided render; no other
line was removed. The raw outputs are in `/tmp/opencode/render-guided.txt` and
`/tmp/opencode/render-autonomous.txt`.)

Doctor repaired the installed copy (never hand-edited):

```
$ bun run --cwd packages/specs cli doctor --dir "$PWD"
+ spec skills and prompts installed or repaired.
✓ montflow-create-specs: already installed → .../.agents/skills/montflow-create-specs
✓ montflow-find-specs: already installed → .../.agents/skills/montflow-find-specs
✓ spec-create: already installed → .../.agents/@montflow/prompts/spec-create.json
+ spec-execute: repaired ('spec-execute.json' differed from the package) → .../.agents/@montflow/prompts/spec-execute.json
```

Canonical and installed copies are byte-identical:

```
$ sha256sum packages/specs/prompts/spec-execute.json .agents/@montflow/prompts/spec-execute.json
7022c3ab9ff14c0f743bdb376090e50f1e13eb7db2f84dc98b023f4556745cc6  packages/specs/prompts/spec-execute.json
7022c3ab9ff14c0f743bdb376090e50f1e13eb7db2f84dc98b023f4556745cc6  .agents/@montflow/prompts/spec-execute.json
```

### Gates (verbatim)

```
$ bun run --cwd packages/specs test
 Test Files  72 passed (72)
      Tests  762 passed (762)
Type Errors  no errors
exit=0
```

```
$ bun run --cwd packages/specs lint:check
$ oxlint --deny-warnings .
exit=0
```

(The only extra output is Node's `MODULE_TYPELESS_PACKAGE_JSON` notice for the
root/tooling config; it is not a finding.)

```
$ bun run --cwd packages/specs format:check
$ oxfmt --check .
Checking formatting...

All matched files use the correct format.
Finished in 331ms on 139 files using 16 threads.
exit=0
```

```
$ bun run --cwd packages/specs ts:check
$ tsc --noEmit
exit=0
```

```
$ bun run mf:check:prompts
4 prompts · 0 issues · 0 warnings
✓ prompts skills are installed and up to date.
✓ montflow-create-prompts: up to date → .../.agents/skills/montflow-create-prompts
✓ montflow-execute-prompts: up to date → .../.agents/skills/montflow-execute-prompts
exit=0
```

```
$ bun run mf:check
46 skills · 0 issues
4 prompts · 0 issues · 0 warnings
6 specs · 0 failed · 0 issues · 79 warnings
11 profiles · 0 issues · 0 warnings
6 files · 0 issues
exit=0
```

The 79 warnings are the pre-existing `task.missing-size` advisories on
historical specs. `doctor --check` inside that run reports both spec prompts
`up to date`.

### Test inventory

`packages/specs/src/modules/prompt/tests/prompt.test.ts`, 16 cases:

1. `spec-create` renders the request and only `montflow-create-specs`
2. optional `notes` appears only when supplied
3. `spec-execute` renders name, state, next, budget 2, guided branch, and its
   three skills
4. guided render keeps dispatch, gates, review, and locking
5. autonomous render from `mode=autonomous` carries the three ask-only cases,
   `MEMORY.md`, and the shared rules
6. omitted mode defaults to guided; `guided` and `autonomous` map to the flag;
   the public mode overrides a stale internal `unsupervised`
7. `autopilot`, `Guided`, `supervised`, `unsupervised` fail `prompt.mode`
8. budget 1 refuses a fourth round; budget 3 names the hard cap
9. missing prompt fails before rendering and writes nothing
10. stale prompt keeps the doctor repair
11. unknown prompt fails `prompt.unknown`
12. missing required value fails `prompt.missing-variable`
13. omitted and blank mode parse to guided
14. exactly the two public names parse
15. internal, cased, and invented names are refused
16. guided renders as a blank flag and autonomous as a non-empty one

## Open Questions

1. **C003 must pass `mode`, not `unsupervised`, into `Prompt.load`.** Add a
   `--mode guided|autonomous` option, parse with `Prompt.parseMode` (or let
   `load` reject it by passing the raw value as `values.mode`), and map the
   existing `PromptError` codes onto the CLI diagnostic. Do not re-implement the
   pair in argument parsing: the loader already rejects `supervised`,
   `unsupervised`, cased names, and invented values with `prompt.mode`.
2. **`mf-prompts inspect` does not print variable descriptions.** Its table
   shows name/label/type/required/default/value only, so the mode explanation
   appears through the prompt `description`, and `unsupervised` is marked
   optional by `REQUIRED no`. If C005 or D003 wants descriptions visible, that
   is a renderer change in `@montflow/prompts`, outside C002.
3. **`unsupervised` label is still "Autonomous".** The table cannot show the
   public/internal split in a label without noise; the description carries it.
   C005 can revisit the label during the docs pass.

## Handoff

- **C003**: load with
  `Prompt.load(root, 'spec-execute', { name, state, next, reviewBudget, phase, focus, mode })`.
  `mode` is the public value; do not translate it to `unsupervised` yourself.
  `--mode` defaults to `guided`; a refused value is `prompt.mode` with
  `expected: 'one of guided, autonomous'`. The expose of `Prompt.parseMode` /
  `Prompt.MODES` / `Prompt.MODE_HINT` is there for help text.
- **D003**: reuse the same loader/mode path; `spec-sizing` will declare its own
  `unsupervised` variable, and `applyMode` will inject it the same way. Do not
  add a second `--mode` parser.
- **C004**: no change; the resolver only supplies `name`.
- **C005**: the canonical execute prompt already describes `--mode`; the README
  and profile pass should quote that pair and the ask-only rule, and may revisit
  the inspect label.
- **Reviewers**: judge (a) only the two public names are accepted, including
  case and the internal pair, (b) guided is the default with a blank flag and
  autonomous a non-empty one, (c) the autonomous render asks only for the three
  listed cases and records the rest in `MEMORY.md`, (d) both renders still carry
  dispatch, `depends-on`, gates, phase review, locking, and verification, (e)
  the canonical and installed prompts are byte-identical and doctor-owned.

## Deviations

- **Mode validation lives in the loader, not only in the CLI.** C003 owns the
  CLI, but the rejection had to be provable in C002 and reusable by D003, so
  `load` validates the reserved `mode` value and D003/C003 inherit it. The
  public contract is unchanged: the CLI still accepts only `guided` and
  `autonomous`.
- **`mode` is a reserved key in the `load` values map, not a template
  variable.** TASK keeps the template variable `unsupervised`; the loader is
  the boundary that maps public to internal, and a prompt that does not declare
  `unsupervised` ignores the key.
- **No `BOARD.md` broadcast**: this phase has no `BOARD.md`, and this run may
  write only its own `MEMORY.md`.
- **No git commit**, per the worker contract.
