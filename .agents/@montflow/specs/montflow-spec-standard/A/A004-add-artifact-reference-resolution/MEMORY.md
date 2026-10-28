# Memory

## Context

A004 (execution, gates, depends-on A001). Make a broken `skills:` reference a
finding instead of silence in the two artifact verifiers. Scope: `pi-profiles`
and `pi-prompts` only. A001 established that `pi-profiles`' *engine*
(`verifyAll`) already caught a bogus skill via `skill-check.module.ts`, but its
pure `verifyProfileFile` (and `list --status`/detail panel) did not, and
`pi-prompts` had no skills resolution at all. This task moves resolution into
the pure verifiers via a caller-supplied store, warns by default, errors under
`--strict`, and stays silent when no store exists.

## Progress

- 2026-10-15: complete

## Findings

### Design

- Each package's `VerifyIssue` gains an optional `severity: 'error' | 'warning'`
  (absent reads as `error`, so pre-severity callers keep failing). `valid` is now
  "no error issue"; a warning is surfaced but never fails verification.
- A new `SkillResolution { root, names }` (the workspace root searched plus the
  installed skill names) is threaded into `verifyProfileFile` / `verifyPromptFile`
  as `{ skills, strict }`. The pure verifier owns no IO; the engine builds the
  resolution. An unresolved name is reported by its exact name and the searched
  root: `Skill '<name>' is not installed under <root>/.agents/skills/.`
- Exit codes no longer derive from raw issue count: the binary/slash fail only
  when an entry is `valid: false`, so a warning cannot red-out CI.
- `pi-profiles` reuses `@montflow/pi-skills` for the store names (`resolveSkills`
  in `skill-check.module.ts`, new `stat` existence check). `pi-prompts` has no
  `pi-skills` dependency (adding it would touch the workspace lockfile, out of
  scope while another worker owns `pi-specs`), so its new `skill-check` module
  reads `.agents/skills` directory names directly, aligning the shape and message
  with `pi-profiles`.

### Files changed — `packages/pi-profiles`

- `src/modules/pi-profiles/pi-profiles.module.ts` — added `IssueSeverity`,
  `severity?` on `VerifyIssue`, `SkillResolution`, `VerifyOptions`, `isError`;
  `withIssues` and `verifyProfileFile(name, markdown, options)` now compute
  `valid` from errors and append skill warnings (errors under `strict`);
  `verifyInfoLine` renders warnings (`✓ verified — N warnings`).
- `src/modules/skill-check/skill-check.module.ts` — added `resolveSkills(cwd)`
  (`undefined` when the store or the skills runtime is absent); one
  lint-disabled `node:fs/promises` `stat` for store existence.
- `src/modules/skill-check/CONTEXT.md` — documents `resolveSkills`.
- `src/apps/cli/engines.apps.module.ts` — added `VerifyOptions`; `verifyAll`
  resolves the store once, passes it to `verifyProfileFile`, and runs the
  standard skill check only on names that exist (unresolved names are the pure
  verifier's warning, not a duplicate error).
- `src/apps/cli/binary.apps.module.ts` — `verify` gains `--strict`; exits
  non-zero only when an entry is invalid.
- `src/apps/cli/renderers.apps.module.ts` — `verify`/`renderVerifyAll` show
  entries that carry warnings.
- Tests: `src/modules/pi-profiles/tests/skills.test.ts` (+3 resolution/strict/
  no-store), `src/modules/skill-check/tests/skill-check.test.ts` (+2
  `resolveSkills`), `src/apps/cli/tests/engines.test.ts` (message updated to the
  rooted path, +2 no-store/strict cases).

### Files changed — `packages/pi-prompts`

- `src/modules/prompts/prompts.module.ts` — added `IssueSeverity`, `severity?`,
  `SkillResolution`, `VerifyOptions`, `isError`; `verifyPrompt`/`verifyPromptFile`
  take options, resolve `skills:`, and compute `valid` from errors;
  `verifyInfoLine`/`verifyReport` render warnings.
- `src/modules/skill-check/skill-check.module.ts` (new) — `resolveSkills(root)`
  reading `.agents/skills` directory names (node fs, lint-disabled), `undefined`
  when no store.
- `src/modules/skill-check/index.ts` (new), `src/modules/skill-check/CONTEXT.md`
  (new), `src/modules/index.ts` — exports `SkillCheck`.
- `src/modules/prompts/CONTEXT.md` — documents the new verification exports.
- `src/apps/cli/engines.apps.module.ts` — added `VerifyOptions`; `verify` and
  `verifyAll` resolve the store and pass it in.
- `src/apps/cli/binary.apps.module.ts` — `verify` gains `--strict`; exits
  non-zero only when an entry is invalid.
- `src/apps/cli/renderers.apps.module.ts` — `verifyAll` shows warning entries;
  `USAGE` lists `--strict`.
- `src/apps/cli/slash.apps.module.ts` — `Verify` fails on invalid entries, not
  issue count.
- Tests: `src/modules/prompts/tests/verify.test.ts` (+3 resolution/strict/
  no-store), `src/modules/skill-check/tests/skill-check.test.ts` (new, 2),
  `src/apps/cli/tests/engines.test.ts` (+1 end-to-end resolve/warn/strict).

### Gate outputs (verbatim)

Completion 1 — bogus skill reported by name:

```
$ bun run --cwd packages/pi-profiles cli verify --dir /tmp/opencode/a004-exp
exp-bot: ✓ verified — 1 warning
  skills: Skill 'totally-nonexistent-skill-xyz' is not installed under /tmp/opencode/a004-exp/.agents/skills/.
1 profile · 1 issue
EXIT=0
```

```
$ bun run --cwd packages/pi-profiles cli verify --dir /tmp/opencode/a004-exp --strict
exp-bot: ✗ not verified — 1 issue
  skills: Skill 'totally-nonexistent-skill-xyz' is not installed under /tmp/opencode/a004-exp/.agents/skills/.
1 profile · 1 issue
EXIT=1
error: script "cli" exited with code 1
```

```
$ bun run --cwd packages/pi-prompts cli verify --all --dir /tmp/opencode/a004-exp
exp-prompt: ✓ verified — 1 warning
  skills: Skill 'totally-nonexistent-skill-xyz' is not installed under /tmp/opencode/a004-exp/.agents/skills/.
1 prompt · 1 issue
EXIT=0
```

```
$ bun run --cwd packages/pi-prompts cli verify --all --dir /tmp/opencode/a004-exp --strict
exp-prompt: ✗ not verified — 1 issue
  skills: Skill 'totally-nonexistent-skill-xyz' is not installed under /tmp/opencode/a004-exp/.agents/skills/.
1 prompt · 1 issue
error: script "cli" exited with code 1
EXIT=1
```

Completion 2 — corrected name verifies clean:

```
$ bun run --cwd packages/pi-profiles cli verify --dir /tmp/opencode/a004-exp
1 profile · 0 issues
EXIT=0

$ bun run --cwd packages/pi-prompts cli verify --all --dir /tmp/opencode/a004-exp
1 prompt · 0 issues
EXIT=0
```

Stage 1 — missing store produces no finding (`/tmp/opencode/a004-nostore`, no
`.agents/skills`):

```
$ bun run --cwd packages/pi-profiles cli verify --dir /tmp/opencode/a004-nostore
1 profile · 0 issues
EXIT=0

$ bun run --cwd packages/pi-prompts cli verify --all --dir /tmp/opencode/a004-nostore
1 prompt · 0 issues
EXIT=0
```

Completion 3 — repo gates still zero:

```
$ bun run verify:montflow:profiles
11 profiles · 0 issues
EXIT=0

$ bun run verify:montflow:prompts
4 prompts · 0 issues
✓ prompts skills are installed and up to date.
EXIT=0
```

Completion 4 — test suites:

```
packages/pi-profiles: Test Files 24 passed (24) · Tests 118 passed (118) · Type Errors no errors
packages/pi-prompts:  Test Files 44 passed (44) · Tests 545 passed (545) · Type Errors no errors
```

Completion 5 — per-package checks:

```
pi-profiles format:check  All matched files use the correct format.
pi-profiles lint:check    Found 0 warnings and 0 errors.
pi-profiles ts:check      $ tsc --noEmit   (no errors)
pi-prompts format:check   All matched files use the correct format.
pi-prompts lint:check     Found 0 warnings and 0 errors.
pi-prompts ts:check       $ tsc --noEmit   (no errors)
```

### Checkbox status

- TASK.md Completion: all four checked by the evidence above (bogus name
  reported; corrected clean; both `verify:montflow:*` zero; tests cover no-store
  and strict).
- GATES.md Stage 0: both checked (caller store root reported; warn default /
  error under strict). Stage 1: all three checked (profile finding, prompt
  finding, missing store no finding).

## Open Questions

- `pi-prompts` cannot reuse `@montflow/pi-skills` without adding a workspace
  dependency and touching `bun.lock`; it reads the store directory directly
  instead. If a shared resolver is wanted later, that dependency decision belongs
  to a task that owns the lockfile.
- The `pi-profiles` engine no longer surfaces `SKILLS_ENGINE_WARNING` when the
  skills runtime is unavailable, because `resolveSkills` returns `undefined` and
  the standard check short-circuits. Behaviour is still "no crash, no false
  issue"; whether to keep the advisory warning is parked.

## Handoff

- Severity is package-local (`severity?: 'error' | 'warning'`, absent = error,
  `valid` = no errors) per the task's "no shared type with pi-specs". A003's
  `pi-specs` severity channel is untouched.
- `--strict` (binary `verify` only; slash parsers do not accept it) promotes an
  unresolved skill from warning to error.
- Non-strict resolution is informational: warnings do not change `valid`, so
  `list --status valid` membership is unchanged without wiring a resolution in.
- Throwaway fixtures live at `/tmp/opencode/a004-exp` and
  `/tmp/opencode/a004-nostore`.

## Deviations

- The A001 note that the CLI already reports a bogus profile skill with exit 1
  still held going in; with the new warn-by-default model that CLI run is exit 0
  (warning) and `--strict` restores exit 1. This is the requested behaviour, not
  a regression.
- `pi-prompts`' resolver is a new small module rather than a reuse of
  `pi-profiles`' skill check, forced by the missing `pi-skills` dependency; the
  resolution shape, message text, and severity semantics are aligned across both.
- No file outside `packages/pi-profiles/**` and `packages/pi-prompts/**` was
  modified by this task.
