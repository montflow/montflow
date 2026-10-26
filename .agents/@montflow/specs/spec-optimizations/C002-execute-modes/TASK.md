---
id: C002
name: execute-modes
type: execution
originator: user
size: small
depends-on: C001
related-tasks:
status: complete
---

# Task C002: execute-modes

## Type: execution

## Description

Give the execute prompt two interaction modes in one template, under the public
names `guided` (default) and `autonomous`. Internally the policy stays
`supervised` / `unsupervised`; only the flag and prose use the public names.

## Requirements

- Public mode names are exactly `guided` and `autonomous`, with `guided` as the
  default. The CLI accepts only those two values; it does not accept the
  internal names.
- Record the naming decision in `MEMORY.md`: the chosen pair, the rejected
  alternatives (`attended` / `unattended`, `copilot` / `autopilot`,
  `interactive` / `headless`, `human-in-the-loop` / `human-on-the-loop`), and
  why `guided` / `autonomous` won. This task owns the names; C003 and C004
  consume them.
- Encode the mode as the optional `unsupervised` template variable. Blank means
  guided, because the template grammar has no string comparison. The loader
  maps `mode=autonomous` to a non-empty value and `mode=guided` to blank.
- Guided branch: the human is present and feedback is welcome. Ask whenever a
  decision would benefit from it, confirm destructive actions, and narrate
  progress through `notify_user`.
- Autonomous branch: do not ask for ordinary decisions. Ask only for:
  - destructive or irreversible actions (force push, deleting work, schema
    migration, rewriting history);
  - very dangerous tool calls;
  - a decision the coordinator genuinely cannot make from the spec and evidence.
  Record every autonomous decision in the task or spec `MEMORY.md`.
- Both branches keep dispatch order, `depends-on`, gates, phase review, locking,
  and verification identical. Only the interaction policy differs.
- The execute prompt covers both entry cases: begin a spec that has no started
  task, and resume one in progress. It reads `state` and `next` context instead
  of assuming.
- Add render tests asserting: guided omits the autonomous-only instructions,
  autonomous includes them, and the shared dispatch and gate rules appear in
  both.
- Document the public `--mode` values in the prompt's `description` and variable
  descriptions so `mf-prompts inspect spec-execute` explains them, naming the
  internal variable only where the reader needs it.

## Completion

- [ ] `mf-prompts inspect spec-execute` explains `guided` and `autonomous` and marks `unsupervised` optional
- [ ] Rendered guided and autonomous prompts both contain dispatch, gates, review, and locking
- [ ] Only the autonomous render contains the autonomous-decision policy
- [ ] The naming decision and rejected alternatives are recorded in `MEMORY.md`
- [ ] Tests assert both branches and the guided default
- [ ] `bun run mf:check:prompts` passes
