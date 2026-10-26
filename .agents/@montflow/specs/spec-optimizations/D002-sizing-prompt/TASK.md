---
id: D002
name: sizing-prompt
type: execution
originator: user
size: medium
depends-on: C001, D001
related-tasks:
status: complete
---

# Task D002: sizing-prompt

## Type: execution

## Description

Ship the third spec prompt. `spec-sizing` is the agent-run wizard for sizing
configs: it shows the existing config, asks the user whether the target is
repo-wide, one spec, or one phase, inventories the harness catalogue, proposes
all four sizes with effort, asks for confirmation, writes exactly one layer, and
proves the result. The prompt's role ships with it as the
`spec-sizing-orchestrator` profile.

## Requirements

- Add `packages/specs/prompts/spec-sizing.json` with `name`, `description`,
  `template`, `variables`, `skills`, and an empty `model`. It is the only source
  of this prompt's text.
- Variables, in first-appearance order: `scope` (optional; `repo`, `spec`, or
  `phase`, with empty meaning "ask"), `name` (optional spec slug), `phase`
  (optional phase id), `unsupervised` (optional; the internal flag for the public
  `autonomous` mode), and `focus` (optional).
- Skills: `executing-skills`, `montflow-find-specs`, `montflow-create-specs`,
  `grilling`, `i-have-adhd`.
- The template opens with the scope state. With `scope` set it names the scope,
  the identifiers, and the exact path the run writes: `<specs-root>/sizing.json`
  for repo, `<spec>/sizing.json` for spec, and `phases.<ID>.sizes` inside that
  spec file for phase. The repo file never gets a `phases` key. With `scope`
  empty it says the scope is open and must be asked before any write.
- Step 1 shows what exists before asking anything: read the repo config verbatim
  and run `mf-specs list` for the spec names. With a fixed spec or phase scope,
  also run `mf-specs status --name <spec>` and read that spec's config. Present
  the current effective mapping and the files found. No model or effort may come
  from memory.
- Step 2 asks the user for the scope when `scope` is empty: repo-wide, this spec,
  or one phase of it, with the existing config as context. Once the scope is
  chosen, read the chosen spec's config and show its mapping before proposing.
  With `scope` set, it states the fixed scope and skips the question.
- Step 3 inventories the catalogue through `spec_models` with the `list` action
  (or `mf-specs models --catalog` when the run has a catalogue file). A `null`
  variant list means unknown variants and forbids an effort; `[]` has the same
  effect; an effort is allowed only when the list contains that exact token.
- Step 4 proposes all four sizes — `tiny`, `small`, `medium`, `large` — as either
  an explicit `provider/model[#effort]` or `inherit`, each with one line of
  reasoning grounded in the catalogue and the existing config. A size with no
  reason to differ stays `inherit`, and a run that would change nothing says so.
- Step 5 shows the exact JSON and path it intends to write and asks the user to
  confirm or adjust. It writes only after that confirmation. It also asks before
  overwriting a non-empty entry with a different value. Cost/quality tradeoffs
  surface inside the proposal, not as separate questions.
- The `{{#if unsupervised}}` branch decides the scope, the proposal, and any
  overwrite itself, records one line per call, and continues without asking.
- Step 6 merges instead of replacing: every unrelated size, `phases` entry, and
  key survives. Emit `sizes` then `phases`, 2-space JSON, trailing newline. One
  run writes one layer; say that another layer takes another run.
- Step 7 proves the result: the catalogue verify action (or
  `mf-specs models --verify --catalog` outside the host) and `mf-specs check` for
  the touched scope, then `sizing --task <id> --human` for one task per explicit
  target. A failing check blocks the report; the report names the file or "no
  change", the four-size mapping with reasoning, the catalogue entries used, and
  the checks with their results.
- Hard bounds stated in the template: no `TASK.md`, task size, `SPEC.md`, or
  status/lock edits; no invented model id or effort; no writes outside the one
  path the scope names; never write before the scope and proposal are resolved.
- Add `.agents/@montflow/profiles/spec-sizing-orchestrator/PROFILE.md` with the
  frontmatter (`name`, `description`, empty `model`, the same five skills) and
  `# Spec Sizing Orchestrator` / `## Instructions` / `## Review Checklist`. The
  body states the wizard order, the proposal rule, the one-layer rule, the merge
  rule, the proof loop, and the hard bounds. `mf:check:profiles` passes.
- The template uses only the declared variables and the closed grammar; the
  prompt verifier and `mf:check:prompts` pass.
- Add a prompt test that verifies the file, the variable bijection, the declared
  skills, and renders it for the open scope, repo scope, spec scope, and phase
  scope.

## Completion

- [ ] `spec-sizing.json` verifies and renders for open, repo, spec, and phase scope
- [ ] The template asks scope first and shows the existing config before proposing
- [ ] The proposal shows all four sizes and requires confirmation before writing
- [ ] The template contains no model id and no effort token of its own
- [ ] The `null` / `[]` / known-variants rule is stated unambiguously
- [ ] The profile passes `bun run mf:check:profiles`
- [ ] `bun run --cwd packages/specs test`, `lint:check`, `format:check`, and `ts:check` pass
