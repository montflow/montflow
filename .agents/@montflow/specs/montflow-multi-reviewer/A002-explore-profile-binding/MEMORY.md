# Memory

## Context

Task A002: map how a reviewer profile is referenced, verified, and turned into a
session today, and assess `effect-reviewer` as the code-phase reviewer. Evidence
gathered from `packages/pi-profiles/src/**` (the `Profile` schema, store,
verifier, CLI engine), `packages/pi-reviews/src/**` (the ledger `Profile:` field
and `SERIES_META_FIELDS`, `ProfileProbe`, the dispatch app and its
`review_create` tool), `packages/pi-sessions/src/**` (the session-start input,
`Session` schema, and the Pi session factory), `packages/pi-prompts/src/**` (how
a declared model/skills is applied to a run), and
`.agents/@montflow/profiles/effect-reviewer/PROFILE.md` plus `generic-reviewer`
and `language-quality-reviewer` for contrast.

## Progress

- 2026-10-13: complete.

## Findings

### PROFILE.md contract

The profile artifact is `Profile`,
`packages/pi-profiles/src/modules/pi-profiles/pi-profiles.module.ts`. Frontmatter
fields (all decoded by `decodeProfileFile(dirName, markdown)`):

| field         | meaning                                                                   |
| ------------- | ------------------------------------------------------------------------- |
| `name`        | slug; must match the profile directory (`isValidName`)                    |
| `description` | one-line role summary; verify requires non-empty                          |
| `model`       | `provider/model-id`, or `''` when unset                                   |
| `skills`      | skill names (SKILL.md frontmatter `name:`) the profile must load          |
| `instructions`| custom system-prompt body (`## Instructions` fallback)                    |
| `checklist`   | items the reviewer must verify (body `## Review Checklist` fallback)      |

- `parseProfileFile` reads scalar `key: value` lines plus blank-value keys
  followed by `  - item` lists; `parseBody` extracts `# Title`,
  `## Purpose` (legacy), `## Instructions`, `## Review Checklist`.
- `encodeProfileFile` writes the canonical form; empty `skills` drop the key.

Discovery and storage: `ProfileStore`
(`packages/pi-profiles/src/services/profile-store/profile-store.services.module.ts`).
Root is `<cwd>/.agents/@montflow/profiles` (`PROFILES_DIR`), file
`PROFILE.md` (`PROFILE_FILE`). Methods `list`, `read`, `save`, `remove`,
`readRaw`, `readAllRaw`, `watch`. `list` silently drops files it cannot decode;
`readAllRaw` keeps them so verification can report a corrupt file.

Verification (`pieces in packages/pi-profiles/src`):

- `verifyProfileFile(dirName, markdown)` (same module) requires a valid slug
  `name` **matching the directory**, non-empty `description`, body `# Title`,
  `## Instructions`, and at least one `## Review Checklist` item. `withIssues`
  folds extra issues in.
- `verifyAll(cwd, names?)` in
  `packages/pi-profiles/src/apps/cli/engines.apps.module.ts` runs
  `verifyProfileFile` per profile and adds skill issues. Declared skills are
  read by `declaredSkills(markdown)` and checked by
  `SkillCheck.checkSkills(cwd, names)`
  (`packages/pi-profiles/src/modules/skill-check/skill-check.module.ts`), which
  delegates to the pi-skills `Cli.Engines.verify` against `.agents/skills/`.
  Montflow (`montflow-*`) skills must pass the full standard; generic/vendored
  skills only have to exist. A missing skills engine is a warning, not a
  failure.
- The `mf-profiles verify <name> --dir <cwd>` CLI is what downstream callers
  shell out to.

### How `pi-reviews` references a profile today

- **Optional ledger field.** A series ledger may carry `- Profile: <name>`.
  `SERIES_META_FIELDS = ['Target', 'Status', 'Rounds', 'Created']`
  (`packages/pi-reviews/src/modules/review/review.module.ts`) does **not**
  include `Profile`, so it is optional. `parseSeries`/`verifySeriesFile` only
  check that a present value is a kebab-case slug (`isValidName`; module lines
  ~752–762). `authoringRules()` documents it as
  `- Profile: <profile name>   # optional; verified against the pi-profiles extension`.
- **`ProfileProbe` verification only.** `ProfileProbe`
  (`packages/pi-reviews/src/services/profile-probe/profile-probe.services.module.ts`)
  exposes `verify(name, cwd): Effect<ProbeOutcome>`; it runs
  `mf-profiles verify <name> --dir <cwd>` (`DEFAULT_BIN = 'mf-profiles'`) and
  reduces to `passed` | `failed` | `unavailable`. It never fails: `unavailable`
  (missing binary) is a warning. `verifySeries`
  (`packages/pi-reviews/src/apps/cli/engines.apps.module.ts`, ~lines 292–304)
  reads `ledger.metadata['Profile']`, and when non-empty calls
  `probe.verify(profile, scope.cwd)`: `failed` adds an issue `{ field: 'profile',
  message: "Profile '<name>' failed verification: …" }`, `unavailable` adds a
  warning.
- **Dispatch takes no profile.** `ReviewDispatchInput`
  (`packages/pi-reviews/src/apps/dispatch/review-dispatch.apps.module.ts`) has
  `root`, `name`, `target?`, `spec?`, `parent?`, `model?`, `thinking?` — no
  profile field. `startReview(input)` ensures the series exists and starts one
  session via the sessions host, passing `model: input.model`,
  `thinking: input.thinking`, `tools: [...REVIEW_TOOLS]` where
  `REVIEW_TOOLS = ['read', 'write', 'edit', 'bash']`, and the prompt
  `reviewerPrompt(input)` which hardcodes loading the
  `montflow-adversarial-review` skill. The `review_create` tool
  (`packages/pi-reviews/src/extension.ts`) accepts only `name`, `target`,
  `spec`, `parent`, `model`, `dir`; it never passes `thinking` and never reads
  a profile. **Consequence:** the ledger `Profile:` is verified but
  informational — it never selects a model, thinking, or skills for the spawned
  session.

### What a profile would need to drive session dispatch

- **Session-start input.** `SessionRunnerStartInput`
  (`packages/pi-sessions/src/services/session-runner/session-runner.services.module.ts`)
  carries `root`, `id`, `name?`, `prompt`, `model?`, `thinking?`, `tools?`,
  `parent?`, `related?`, `spec?`, `onSettled?` — **no `skills` field**. The
  persisted `Session` schema
  (`packages/pi-sessions/src/modules/session/session.module.ts`) stores `model`,
  `thinking` (`ThinkingLevel`), `tools`, but no skills.
- **Applying `model` and `thinking`.** In `createPort`
  (`packages/pi-sessions/src/services/session-runner/pi-session.services.module.ts`)
  the model is resolved with `pi.resolveCliModel({ cliModel: request.model, … })`,
  then `const thinking = resolved?.thinkingLevel ?? request.thinking` and
  `options.thinkingLevel = thinking`. `start` forwards `input.model` and
  `input.thinking` into `Store.CreateArgs` and `SessionRequest`. Note a resolved
  model can itself carry a `thinkingLevel`, which wins over the explicit pin.
- **Loading `skills`.** No session or dispatch surface accepts skills. The only
  existing mechanism is prompt injection: `pi-prompts` `executeFor`
  (`packages/pi-prompts/src/extension.ts`) maps each `request.skills` name to
  `Load the '<name>' skill before starting.` and passes that as the run's
  `preprompt`, with `modelLabel: request.model` and an explicit `tools` list.
  `PromptExecute.execute` (`packages/pi-prompts/src/modules/prompt-execute/prompt-execute.module.ts`)
  resolves `model` (request, else the prompt's own `model`) and `skills`
  (request, else the prompt's own `skills`). This is the closest existing
  precedent for making a declared model/skills drive a run.
- **How tools are chosen.** Tools are a per-caller allowlist: dispatch hardcodes
  `REVIEW_TOOLS`, the `review_create` tool passes none (Pi default); `createPort`
  unions the list with the interaction tools (`withInteractionTools`). No
  profile input reaches tool selection.
- **Gaps for profile-driven dispatch.** `Profile.model` would become the
  `model` pin; its `thinking` does not exist on the schema at all (see Open
  Questions); its `skills` have no session sink, so they would ride the prompt
  (as `pi-prompts` does) or require a new `skills` input. `ReviewDispatchInput.thinking`
  is declared but no caller (the `review_create` tool) ever populates it, so it
  is currently a dead input.

### `effect-reviewer` as the code-phase reviewer

- Path: `.agents/@montflow/profiles/effect-reviewer/PROFILE.md`. `name:
  effect-reviewer`; a one-line description; **`model:` is empty (no pin)**;
  `skills:` = `effect`, `montflow-typescript-services`,
  `montflow-typescript-structs`, `montflow-typescript-testing`,
  `simplifying-code`, `detecting-duplication`, `typescript-prefer-inference`.
- Body: `## Instructions` (focus areas: return-type inference, idiomatic Effect
  v4, data modeling, services/layers/config, schedules/caches/streams/HTTP,
  boundaries, `services/` and `structs/` module structure, `@effect/vitest`
  tests), `## Replacement Opportunities` (Node imports → services, branching →
  `Match`, plain JS/deps → Effect modules), `## Avoid`, and a 10-item
  `## Review Checklist`. It is explicitly a reviewer that does not rewrite,
  which fits a review phase.
- **Missing model pin.** With `model:` blank, dispatching it would inherit the
  dispatching session's model (as `ReviewDispatchInput.model` does via
  `modelLabelOf(ctx.model)`), unless B003 decides a pin. The SPEC requires "the
  profile's model and thinking applied", so this blank is an open decision, not
  a defect.
- **Composition with a general reviewer over the same phase.** Today a phase
  holds exactly one `review` task mapping to one round, and one series named
  after the spec (`review-link.module.ts` `verify`/`roundForPhase`, `A → 001`).
  `effect-reviewer` is a specialist that should **join** the general reviewer,
  not replace it: same phase, same round number, but a separate series per
  profile (SPEC requirement). No mechanism exists today for two reviewers on one
  phase — the round file and the global `F<n>` finding ids would collide. Note
  `.agents/@montflow/pi-prompts/effect-review.json` is a reusable *prompt* that
  reads the profile; it is a separate surface, not a profile binding.

### Profile fields with no consumer today (informational)

- `Profile.model` — decoded/encoded and displayed, but no dispatch, review, or
  session code reads it.
- `Profile.skills` — read only by verification (`declaredSkills` →
  `checkSkills`); never loaded into a session.
- `Profile.instructions` and `Profile.checklist` — not read by any dispatch or
  review code path (only encode/decode); the reviewer prompt hardcodes the
  `montflow-adversarial-review` skill and ignores the profile body.
- `Profile.description` — display plus the verifier's non-empty requirement.
- Ledger `Profile:` — verified by `ProfileProbe` only; never drives dispatch.
- `ReviewDispatchInput.thinking` — declared but never populated by the
  `review_create` tool.

## Open Questions

- The `Profile` schema has no `thinking` field, yet the SPEC asks dispatch to
  apply the profile's thinking. Does the profile gain a `thinking` field, or is
  thinking derived from the resolved model / left to the dispatch default?
- How should `skills` reach a session: prompt-prepend (the `pi-prompts`
  `executeFor` pattern) or a new `skills` field on `SessionRunnerStartInput` /
  `Session`?
- Does `effect-reviewer` get a pinned `model` (field is empty today), or inherit
  the dispatcher's model? B003 decides.

## Handoff

- Feeds A003 synthesize-multi-reviewer-contract.

## Deviations

- None.
