# Memory

## Context

Task C003: make review dispatch profile-aware. The decisive contract is B002 §1
(dispatch: resolve the profile and validate the series name **before**
`ensureSeries`, F13/F15; exact error strings; model precedence
`profile.model (non-empty) > input.model`; thinking via the pinned model's
`thinkingLevel` then the input `thinking`; skills prepended to the prompt;
round/phase named in the prompt), §2 (the `- Profile:` ledger line, the F4
`ensureSeries` stamp/merge, and the F9 `verifySpecProfiles` pass that keeps
`ProfileProbe` out of declared-profile resolution), and §6 (the change-list rows
owned by C003); B001 §2 (series naming: `seriesName` identity,
`profileSeriesName = <spec>-<profile>`, default-first) and §4 (the layered
unknown-profile reporting; the `verify:montflow:reviews` existence tier); B003
§2c/§3 (the `effect-reviewer` model pin stays **blank** — the dispatcher's model
is inherited; the profile's value is its skills; `--profile` is the CLI seam).
C001/C002 are complete and committed; C003 implements only its own rows — no
C002 round-grammar/workspace-link work, no C004 `EXECUTING_SPEC`/skill wording,
no C005 migration/series.

Implemented in `packages/pi-reviews` only. Read: `review.module.ts`,
`engines/binary/slash/renderers.apps.module.ts`, `review-dispatch.apps.module.ts`,
`extension.ts`, `package.json`, the pi-reviews tests, `@montflow/pi-specs`
`SpecStore`/`Task.parseTaskFile`, `@montflow/pi-profiles` `Profile`/`ProfileStore`,
and the pi-sessions `Session`/`SessionRunner`/`Runtime` surfaces. `bun install`
ran (new workspace dep `@montflow/pi-specs`). No file outside
`.agents/@montflow/specs/` and `packages/pi-reviews/` was touched.

## Progress

- 2026-10-15: complete. All five scoped gates green (see Findings §7).

## Findings

### 1. Ledger `Profile:` line (`review.module.ts`)

- `SeriesScaffold.profile?: string`; `renderSeries` emits `- Profile: <profile>`
  between `- Rounds:` and `- Created:` only when the profile is non-blank
  (`undefined` and `''` both omit the line). This is the position
  `authoringRules()` already documents (B002 §2).
- `SERIES_META_FIELDS`, `parseSeries`, and `verifySeriesFile` are unchanged:
  `Profile` stays optional and a present value is validated as a slug (C002 wrote
  the `- Phase:` round line; no round grammar here).
- `authoringRules()` already listed the optional `- Profile:` line (B002 §3/F18
  added `- Phase:` next to it), so no wording change was needed.

### 2. F9 declared-profile resolution (`engines.apps.module.ts`)

- New `verifySpecProfiles(scope)`: derives `<cwd>/.agents/@montflow/specs`
  (`scope.cwd` is the workspace root), reads it through `@montflow/pi-specs`'
  `SpecStore` (`hasRoot`/`names`/`snapshot`), and parses every `TASK.md` with
  `Task.parseTaskFile` so the TASK.md grammar keeps one owner. An absent specs
  root returns `[]` — a reviews-only repo is not broken. For every
  `type === 'review'` task (pending **or** complete, `reviewerProfiles`
  deduped) each declared profile is resolved with `ProfileStore.read(scope.cwd, …)`;
  a read failure adds one entry `path:
  '.agents/@montflow/specs/<spec>/<task-dir>/TASK.md'`,
  `field: 'reviewer-profiles'`,
  `message: "Declared reviewer profile '<profile>' was not found under
  .agents/@montflow/profiles."` `ProfileProbe` is deliberately not used, so the
  `unavailable` outcome cannot mask a missing profile.
- `verifyAll` merges these entries after the per-series groups and counts their
  issues; its effect requirement became `ReviewStore | ProfileProbe | SpecStore |
  ProfileStore`. The F9 pass fires for a declared profile with no series, which
  the series-scoped checks could not see.
- `ScaffoldFields.profile?: string`: `scaffold` passes it into `renderSeries`, and
  reads the existing ledger first so a re-scaffold without `--profile` **preserves**
  an existing `- Profile:` (otherwise emitting the line would silently drop it).

### 3. Profile-aware dispatch (`review-dispatch.apps.module.ts`)

- `ReviewDispatchInput` gains `profile?`, `round?`, `phase?` (plus the existing
  `model?`/`thinking?`, now live).
- `resolveProfile(input, profile)` (runs in `startReview` **before**
  `ensureSeries`): `ProfileStore.read(input.root, input.profile)`; a miss fails
  `Cannot dispatch review series '<name>': profile '<profile>' was not found
  under .agents/@montflow/profiles.`; with `spec` the name must equal
  `<spec>-<profile>` (else `… belongs to series '<spec>-<profile>'.`); without
  `spec` the name must end in `-<profile>` (else `… is not the series-name
  suffix.`). So an unknown profile or a mismatched name starts no session and
  leaves nothing on disk (F13/F15).
- `ensureSeries` (F4): with **no** profile it leaves an existing ledger exactly
  as before (back-compat). With a profile it parses the ledger; `issues.length > 0`
  fails loudly (`… ledger is malformed; run \`mf-reviews verify <name>\` …`); a
  matching `Profile:` is idempotent; an empty one is merged (metadata, rounds, and
  findings preserved, only `Profile:` added); a different one fails
  (`… is already bound to profile '<other>'; refusing …`). A missing ledger is
  created stamped.
- `reviewerPrompt(input, skills = [])`: prepends `Load the '<skill>' skill before
  starting.` lines (the `pi-prompts` `executeFor` pattern, B002 §1d), and adds
  `- Profile:`, `- Round:`, `- Phase:` context lines only when set.
- Model precedence in `startReview`: a non-blank `profile.model` overrides
  `input.model`, a blank one falls back to it; `input.thinking` is passed through
  and Pi applies the resolved model's `thinkingLevel` first
  (`pi-session.services.module.ts`). The result stays `{ sessionId, series }` —
  one series/session per call; the orchestrator owns the per-series loop (B002
  §1f). `startReview`'s requirement is `ReviewStore | ProfileStore`.

### 4. Tool, layers, and CLI

- `review_create` gains `profile`, `round`, `phase`, `thinking` params; `thinking`
  is decoded against `Session.ThinkingLevel` and an unknown level returns an
  `Error: '<x>' is not a thinking level (…)` text without dispatching.
- `Live` (`extension.ts`) adds `ProfileStore.Default` + `SpecStore.Default`
  (each provided `NodeLive`); `Cli.register`'s and slash `run`'s layer types
  widened to include both. Binary `rootCommand` provides
  `SpecStore.Default` + `ProfileStore.Default` (NodeServices supplies
  FileSystem/Path at run).
- `--profile`: `createFlags.profile` (binary, shared by `create`/`new`),
  `CliAction.Create.profile` + the `create`/`new` known-flag set + `run` (slash),
  and the slash `USAGE`/`COMMAND_DESCRIPTION` (the renderers `USAGE` already
  advertised `--profile`).
- `@montflow/pi-specs` added to `packages/pi-reviews/package.json` (workspace) so
  the F9 pass reuses `SpecStore`/`parseTaskFile`; `bun install` updated `bun.lock`.

### 5. Tests

New: `apps/cli/tests/verify-spec-profiles.test.ts` (6: absent root no-op; declared
profile present passes; declared-but-uncreated fails with the exact path/field/
message; two profiles resolved independently; `verifyAll` folds the issue into
its count; a non-`review` task's field ignored), `apps/cli/tests/slash.test.ts`
(3: `--profile` parsed; unknown flag still `Help`; `run` threads the profile and
stamps the ledger), `src/extension.test.ts` (3: params include
`profile`/`round`/`phase`/`thinking`; `execute` forwards them and applies the
profile model; an unknown thinking level is rejected before dispatch).

Updated: `apps/dispatch/tests/review-dispatch.test.ts` (9: prompt names
round/phase/profile/skills; no-host path unchanged; unknown profile fails with
nothing on disk; name mismatch with and without `spec`; pre-created unstamped
ledger stamped and idempotent; rebind refused; one session per profile with the
profile model override and a blank-model fallback; single-reviewer unchanged with
no `Profile:` and `thinking` carried), `apps/cli/tests/engines.test.ts` (9:
scaffold stamps `- Profile:` and a later scaffold preserves it, plus the widened
`Live` layers).

### 6. Gate results

From the repo root, package scripts only:

- `bun run --cwd packages/pi-reviews test` → **pass** — 22 files / 142 tests, no
  type errors.
- `bun run --cwd packages/pi-reviews ts:check` → **pass** — `tsc --noEmit`, no
  output.
- `bun run --cwd packages/pi-reviews lint:check` → **pass** — 0 warnings, 0 errors.
- `bun run --cwd packages/pi-reviews format:check` → **pass** — "All matched files
  use the correct format."
- `bun run verify:montflow:reviews` → **pass** — `8 files · 0 issues` and doctor
  clean. The F9 pass ran (the specs root exists) and is a no-op today because no
  review task declares `reviewer-profiles` yet (C005 adds `C099`'s).

## Open Questions

- **C004:** `EXECUTING_SPEC` one-session-per-series (call `review_create` once per
  expected series, passing the same computed round/phase/profile) and the
  `montflow-adversarial-review` wording that writes the exact round and
  `- Phase:`.
- **C005:** the `C099` `reviewer-profiles: effect-reviewer` line, the profile
  ledger, and the `- Phase: A`/`- Phase: B` stamp on rounds `001`–`004`.

## Handoff

- The dispatch write path and F9 resolution are in place. C004's orchestrator
  calls `review_create` per series; C005 lands the first declared profile; the
  `verify:montflow:reviews` gate will then resolve it.

## Deviations

- **`create --profile` still writes the first round (B003 §2c blocker).** B003 §2c
  says `mf-reviews create <name> --profile effect-reviewer` should create "the
  series ledger … and no round". `Engines.scaffold` is the round-creating
  operation and still writes round `001` (C003's row was only "pass `profile` into
  `renderSeries`"). C005 must therefore either delete the placeholder round it
  creates or accept that the profile series starts at `001`; B003 §2c's "no
  round" is not satisfiable through this CLI without a separate ledger-only path.
  Flagged rather than worked around, since it is outside C003's rows.
- **`authoringRules()` not changed.** B002 §6 lists it against C003, but the
  artifact contract already documents the optional `- Profile:` line (between
  `Rounds` and `Created`), so the row was already satisfied.
- **`piReviewsExtension`'s `pi` parameter narrowed** from `ExtensionAPI` to
  `Pick<ExtensionAPI, 'registerCommand' | 'registerTool'>`, matching the
  `makePiSessionsExtension` / `PiEffect.registerCommandEffect` convention and
  enabling the fake-API test without a lint-rejected `as unknown as` assertion.
  The full `ExtensionAPI` (Pi's caller) is assignable to the narrower type.
- **COMMAND_DESCRIPTION/USAGE location.** B002 §6 names `renderers.apps.module.ts`,
  but `COMMAND_DESCRIPTION`/slash `USAGE` live in `slash.apps.module.ts`; the
  renderers `USAGE` already advertised `--profile`. Updated the slash pair and
  left the renderers line as-is.
- **Scaffold preserves an existing `- Profile:`.** Not named in the C003 rows, but
  `renderSeries` now emits the line, so a re-scaffold without `--profile` had to
  read and reuse the existing value or it would silently clear the stamp.
