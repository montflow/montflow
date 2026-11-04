---
id: I003
name: wire-status-entrypoints
type: execution
originator: user
size: tiny
depends-on: I002
related-tasks: I099
status: pending
write-scope: packages/specs
---

# Task I003: wire the status entry points

## Type: execution

## Description

I002 ships the prompt, but it is only reachable if the spec surfaces can load
it. Wire I001's chosen entry points so a human or agent can ask for one spec's
status from the binary, the `/specs` slash form, and the host tool without
copying the prompt or re-deriving the spec name.

## Requirements

- Implement exactly the surfaces I001 fixes: the binary command and flags, the
  `/specs` slash command and its flag row, and, when I001 chooses one, the
  `spec_status` host tool. Keep `mf-specs status` as the raw status panel; a new
  mode must not silently change an existing verb's output.
- Add the engine that loads `spec-status` through `modules/prompt` and fills the
  internal values I001 chose from the same `status`, `state`, `next`, and
  `check` results the raw commands use. Never call a second derivation or copy
  the prompt text into TypeScript.
- Reuse the shared `which` resolver and the shared `source: specs` picker
  behavior. An explicit `--name` always wins. A detached HEAD, a prefix-less
  branch, no candidate, or an ambiguous match fails with the branch, every
  candidate, and the exact `--name`; the surface asks the user and never picks
  one.
- The binary renders and prints; it performs no write, no dispatch, and no git
  mutation. The slash command and host tool use the same `modules/prompt`
  loader and the same `PromptExecutor` path as `execute`, so the rendered text
  and skill prelude are identical for identical values and the host model
  default still applies.
- Refuse a malformed name, an unknown spec, and a missing root with the coded
  diagnostics the raw commands print, including the exact rerun. Do not invent
  a fallback spec.
- Update the `/specs` help, the `montflow-find-specs` skill, the
  `@montflow/specs` README, and the CLI context/docs to name the new surface
  and its relationship to `status`, `state`, `next`, and `execute`. The prompt
  file stays the only copy of the report text.
- Tests cover: binary and slash parity for the same name and focus; `spec_status`
  parity when it exists; an explicit name beating the branch guess; ambiguous
  and missing branch failures; unknown-spec and malformed-name diagnostics; and
  that no surface writes spec state, changes a lock, or dispatches a worker.
- Run the scoped specs CLI, prompt, and host-tool suites.

## Execution

Follow the phase `MEMORY.md` `## Execution Brief`: read only this task, that brief, and the scoped source; run each gate once; keep this task's `MEMORY.md` under 80 lines; batch review findings into one fixer attempt.

## Completion

- [ ] Every surface I001 names loads the installed `spec-status` prompt and renders the same text
- [ ] An explicit name wins, and ambiguous or missing branch resolution asks the user with the candidates
- [ ] The binary performs no writes, dispatch, or git mutation
- [ ] Unknown spec, malformed name, and missing root carry the coded diagnostic and exact rerun
- [ ] The help, skill, README, and CLI docs name the new surface without copying the template
- [ ] Scoped CLI and host-tool tests are green
