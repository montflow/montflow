# Prompt module

Loads and renders the shipped spec prompts. No template text lives here: the
only source is `packages/specs/prompts/*.json`, installed into
`.agents/@montflow/prompts/` by `mf-specs doctor`.

## Belongs here

- `PROMPT_NAMES` — the shipped slugs (`spec-create`, `spec-execute`,
  `spec-sizing`), re-exported from the doctor ownership list
- `load(root, name, values)` — gate on `mf-specs doctor`, read the installed
  prompt through `@montflow/prompts`' `PromptStore`, verify it and resolve its
  declared skills, check required values, render it, and return
  `{ text, skills, advisories, prompt }`
- `MODES` / `parseMode` / `unsupervisedOf` — the public `guided` (default) and
  `autonomous` names, the internal `supervised` / `unsupervised` policy they map
  onto, and the truthy `unsupervised` flag the template grammar needs
- `PromptError` / `SkillAdvisory` / `CODES` / `DOCTOR_FIX` — one coded failure
  (`code`, `path`, `field`, `problem`, `expected`, `actual`, `fix`, preserved
  `cause`) naming the file, the problem, and the repair command; the same fields
  carry `prompt.skill-advisory` when a non-owned declared skill is missing, and
  the advisory is handed to the shared renderer structurally so a `cause` or any
  future field is never dropped. The renderer prints `cause` only under
  `--verbose`.
  `Code` is the failure channel only, and `AdvisoryCode`
  (`prompt.skill-advisory`) is the advisory-only literal, so a `Match` over
  `Code` is exhaustive over the ways `load` can fail

## Rules

- **Doctor gates before rendering.** The installed copy is compared byte for
  byte with the package prompt; `missing`, `stale`, and `blocked` fail with a
  `PromptError` before the file is read or rendered. `--check` semantics come
  from `modules/doctor`, so the loader never writes.
- **`@montflow/prompts` owns the store, verifier, and renderer.** This module
  reuses `PromptStore.readRaw`, `Prompts.verifyPromptFile`, and
  `Prompts.renderPrompt`; it does not parse JSON, validate templates, or
  substitute values itself.
- **Skills are returned, never inlined.** The caller loads `spec-create`'s
  `montflow-create-specs`, `spec-execute`'s find/review skills, and
  `spec-sizing`'s find/create plus `executing-skills`, `grilling`, and
  `i-have-adhd`. No skill body is duplicated in TypeScript.
- **Doctor-owned skills are required; the rest are advisory.** Every declared
  doctor-owned skill is resolved against the doctor result. A missing, stale, or
  blocked owned skill fails with `prompt.skill-missing` / `prompt.skill-stale` /
  `prompt.skill-blocked`, the skill name as `field`, and the repair that actually
  converges as `fix` — `mf-specs doctor` for a missing or stale payload, and the
  doctor-reported removal/move for a `blocked` payload, which doctor refuses to
  write over. A non-owned declared skill is resolved against
  `<root>/.agents/skills`: when it is absent the prompt still loads, the text
  gains a `prompt.skill-advisory` block rendered through `modules/diagnostic`
  with the canonical labels, the `! ` warning marker, and a `next` re-run
  command, and `advisories` carries one `SkillAdvisory` per miss.
- **Only installed skills reach the executor.** `LoadedPrompt.skills` is the
  declared order filtered to skills actually installed, so a caller never asks a
  session to load a skill the workspace does not hold. The decoded
  `prompt.skills` keeps the full declaration for inspection.
- **A blocked payload keeps doctor's repair.** For `blocked` prompts and skills
  the loader propagates `failure.fix` instead of defaulting to `DOCTOR_FIX`,
  because re-running doctor cannot clear a symlink or an obstruction; the
  fix is the removal or move doctor's own report printed.
- **Mode is an interaction switch, not a policy switch.** The public names are
  exactly `guided` (default) and `autonomous`; the loader maps a caller's `mode`
  onto the `unsupervised` variable (blank for guided, non-empty for autonomous)
  because the template grammar has no string comparison. Any other value fails
  `prompt.mode` before rendering. Mode never changes dispatch, `depends-on`,
  gates, phase review, locking, or verification.

## Does not belong here

- Session dispatch — the host `subagent` tool or the caller owns it
- CLI argument parsing and diagnostic rendering — `apps/cli`
- Installing or repairing prompt files — `modules/doctor`
- Prompt file shape, template grammar, and verification rules —
  `@montflow/prompts`
