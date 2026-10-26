---
id: C003
name: author-execute-commands
type: execution
originator: user
size: medium
depends-on: C001, C002, C004
related-tasks:
status: complete
---

# Task C003: author-execute-commands

## Type: execution

## Description

Expose the loaded prompts as commands. `mf-specs author` and `mf-specs execute`
render them for dispatch; the host tools and slash forms dispatch the rendered
text on a session. The binary stays model-free, exactly like `mf-prompts`.

## Requirements

- Add `author --request <text> [--notes <text>]` to the CLI: load `spec-create`,
  render with the request, print the rendered prompt and nothing else.
- Add `execute [--name <spec>] [--phase <id>] [--focus <text>]
  [--mode guided|autonomous]`: load the spec, gather `state` and `next`
  context, load `spec-execute`, render, and print. `--mode` defaults to
  `guided`; any other value is an error naming the accepted pair.
- When `--name` is omitted, resolve the spec through the C004 resolver and use
  its answer. When the resolver finds no unique match, fail with the candidate
  list and the exact `--name` to pass; the host tool returns the same failure so
  the agent asks the user instead of guessing.
- Compute the active phase's review budget through the sizing module and pass it
  to the template as `reviewBudget`. The host tool does the same; neither asks
  the model to derive it.
- Both commands refuse an invalid or missing spec and a missing or stale prompt
  with the agent-first diagnostic shape, using the same error codes as `check`.
- Register host tools `spec_author` (`request`, optional `notes`, optional
  `model`) and `spec_execute` (optional `name`, `phase`, `focus`, `mode`,
  `model`). They load and render the same prompts, then dispatch through the
  host `ModelPort` + `SessionDispatchPort`.
- Export the prompt executor factory from `@montflow/prompts` and reuse it in
  `packages/specs`; do not copy the child-run implementation.
- Register `/specs author …` and `/specs execute …` slash forms and extend
  `COMMAND_DESCRIPTION` with both verbs.
- A dispatched execute run must be resumable: it re-derives state at start and
  never trusts context passed by a caller.
- Tests cover: rendering for both commands, default mode, unknown mode, missing
  prompt gate, unknown spec/task, omitted `--name` resolving through the
  resolver, ambiguous detection, the host tool input/output, and that the binary
  never dispatches.
- Update `apps/cli/CONTEXT.md` and the CLI help text.

## Completion

- [ ] `bun run --cwd packages/specs cli author --request "Ship login"` prints one rendered prompt
- [ ] `bun run --cwd packages/specs cli execute` resolves `spec-optimizations` from `feat/spec-optimizations` and prints one rendered prompt with state and next context
- [ ] `bun run --cwd packages/specs cli execute --name spec-optimizations` skips detection
- [ ] An ambiguous branch prints the candidates and exits non-zero
- [ ] `--mode autonomous` changes only the interaction policy
- [ ] The rendered execute prompt carries the phase review budget, and a tiny-only phase carries 1
- [ ] `spec_author` and `spec_execute` are registered and dispatch through the shared executor
- [ ] `/specs author` and `/specs execute` are listed in the command description
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
