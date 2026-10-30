# Memory

## Context

Read-only inventory of every place a verifier decides `valid`, so A003 (severity
channel) and A004 (skills reference resolution) get a complete call-site list
before changing any of them. Evidence base: `pi-specs` `modules/verify` + every
`Issue`/`Result` consumer, `pi-profiles` `VerifyIssue`/`verifyProfileFile`/
`engines.verifyAll`, `pi-prompts` `VerifyIssue`/`verifyPrompt`/`verifyPromptFile`,
the three CLIs, and two throwaway fixtures under `/tmp/opencode/a001-exp`. Every
claim cites a file:line.

## Progress

- 2026-10-15: complete

## Findings

### 1. `pi-specs` `modules/verify` — definitions and every consumer

Definitions (`packages/pi-specs/src/modules/verify/verify.module.ts`):
- `Issue { field, message }` — :2-5. **No `fix`, no `line`, no severity.**
- `Result { valid, issues }` — :8-11.
- `issue(field, message)` factory — :19; `hasSection` — :27; `infoLine(result)` reads
  `result.valid` — :35-39 (no non-test caller in the repo; exported but unused).

Producers (each returns `Result`, all imported from `../verify/index.js`):
- `spec.module.ts` `verifySpecFile` — :166, `issues:Array<Issue>` :167.
- `task.module.ts` `verifyTaskFile` — :200, :201.
- `gates.module.ts` `verifyGatesFile` — :48, :52.
- `memory.module.ts` `verifyMemoryFile` — :20, :24.
- `structure.module.ts` `verifySpecTree` — :105, `issues` :106, `nest` :85,
  early `{valid:false, issues}` :118; aggregates the four file verifiers.
- `lifecycle/lifecycle.module.ts` `verify(input)` — :90, `issues` :91. This is a
  **separate vocabulary** (`Issue`/`Result` reused), not the structure verifier.
- `review-link/review-link.module.ts` — :73, :74 (cross-store series check).

Consumers that read `valid`:
- `lifecycle.module.ts:177` — `analyze` maps `!result.valid` → state `'inconsistent'`;
  this is how a lifecycle `Issue` becomes user-visible via `state`/`status`/`next`.
- `cli.apps.module.ts` (the `mf-specs` binary + slash):
  - import `type { Issue, Result }` :20.
  - `CheckSpec { name, valid, issues }` :42-46; `CheckReport` :49-54.
  - `check()` — manual not-found issue :88-96; `specs[...] = {valid: result.valid, issues}` :105; `failed = specs.filter(!valid)` :113.
  - `renderCheck` :125 reads `spec.valid` :129, :131, :133.
  - `StatusReport.verify: Result` :154; `summarize` sets `verify: verifySpecTree(snapshot)` :187.
  - `renderStatus` :246 reads `report.verify.valid` :262.
  - `renderList` :538 reads `spec.verify.valid` :546.
  - `state`/`next` derive from `report.state` (lifecycle), not `verify`.

`valid` → exit code / ok flag:
- `checkCommand` :752-786: prints `renderCheck`, then `if (report.failed > 0) process.exitCode = 1` — **:775-779**. This is the nonzero exit the `verify:montflow:specs` gate relies on.
- `statusCommand` :788-801: `if (!report.verify.valid) process.exitCode = 1` — **:792-796**.
- `runSlash` :1056-1133 (slash form, returns `SlashReport { output, ok }`):
  - `status` → `ok: report.verify.valid` :1091
  - `state` → `ok: report.state !== 'inconsistent'` :1103
  - `next` → `ok: report.state !== 'inconsistent'` :1115
  - `list` → `ok: true` (always) :1125
  - `check` → `ok: report.failed === 0` :1132
- `extension.ts:39` consumes `report.ok` — `ctx.ui.notify(report.output, report.ok ? 'info' : 'error')`. **The slash form has no exit code**; `ok` only picks notify severity.
- `runCheck` named in `TASK.md` **does not exist** anywhere in `packages/*/src` (grep found no symbol).

Net: to add severity, the `pi-specs` touch list is `Issue`/`Result` shapes
(`verify.module.ts:2-11`), the six producer verifiers, `verifySpecTree` aggregation
(`structure.module.ts:105`), lifecycle `verify` (`lifecycle.module.ts:90`), and the
three read sites plus two exit sites in `cli.apps.module.ts`
(:105/:113, :262, :546, :775-779, :792-796, :1091, :1132).

### 2. `pi-profiles` — `verifyProfileFile` and `engines.verifyAll`

Sources (`packages/pi-profiles/src/modules/pi-profiles/pi-profiles.module.ts`):
- `VerifyIssue { field, message }` :107-110 — **only two fields** (no `fix`/`line`).
- `VerifyResult { valid, issues }` :113-116.
- `verifyIssue` :118; `withIssues(base, extra)` folds extra issues and forces `valid:false` :127-134.
- `declaredSkills(markdown)` reads the frontmatter `skills:` list — :142-146 (pure, never called by `verifyProfileFile`).
- `verifyProfileFile(dirName, markdown)` :157-181 — checks: frontmatter present, `name` slug + equals dir (:165-170), non-empty `description` (:171-173), body `# Title` / `## Instructions` / `## Review Checklist` (:174-179). **Never inspects `skills` or `model`.**
- `verifyInfoLine(result)` reads `result.valid` :188-192.

Engine (`packages/pi-profiles/src/apps/cli/engines.apps.module.ts`):
- `verifyAll(cwd, names?)` :50-90. `profileNotFound` :36-39. Loops entries :76-83:
  base = `verifyProfileFile` :78, then `PiProfiles.declaredSkills(raw).map(...)`
  :79-81, folded via `withIssues` :82. `issueCount` :84; `warnings` :88.
- The skill check runs **here only**: `SkillCheck.checkSkills(cwd, declaredSkills…)`
  :68-71, and `skill-check/skill-check.module.ts` `checkSkills` :96-104 lazily
  imports `@montflow/pi-skills` and calls `Cli.Engines.verify({cwd}, name)` (checkOne
  :66-86). If the lib cannot load it **skips with a warning and issueCount stays 0**
  (`SKILLS_ENGINE_WARNING` :21). So profile skill resolution is engine-level and soft.
- `filterByStatus` :246-264 uses **`verifyProfileFile(...).valid` only** :258 — no skill check.
- Binary `verifyCommand` :130-150: `issueCount > 0 → exitFailed` :143 (`exitFailed` :18-20).
- Slash `cli.apps.module.ts` `Verify` case :214-234: warns on `report.warnings`
  :219-221, fails when any entry invalid :222-233.
- Interactive: `verifyProfile` :1044-1056 (pure `verifyProfileFile`), `detailOptions`
  :1033, `notifyVerifyResult` :1069, panel line :1153-1156.

### 3. `pi-prompts` — `verifyPrompt`, `verifyPromptFile`, richer `VerifyIssue`

Sources (`packages/pi-prompts/src/modules/prompts/prompts.module.ts`):
- `VerifyIssue { field, message, fix?, line? }` :327-334 — **already carries `fix` (:331) and `line` (:333)**.
- `VerifyResult { valid, issues, expectedVariables? }` :337-346.
- `verifyIssue` :363-368 (omits absent `fix`/`line`); `expectedJson` :375.
- `verifyPromptFile(name, raw)` :407-443: JSON decode → `verifyPrompt`, then file-name
  match appended :428-442.
- `verifyPrompt(prompt)` :457-575: `name` slug :461, `description` :469, `template`
  :477, grammar via `TemplateEngine.inspect` :484-490, variable dupes/legal/required+default
  :502-532, coverage both ways :534-557, order :558-567. **Never inspects `skills` or `model`.**
- `verifyInfoLine` :582-586; `verifyReport` renders `Fix:`/`(line N)` :597-617.

Engine (`packages/pi-prompts/src/apps/cli/engines.apps.module.ts`):
- `verify(scope, name)` → `verifyPromptFile(name, raw)` :208-212.
- `verifyAll(scope)` over raw `*.json` :232-246.
- `list --status` filter uses `verifyPromptFile(...).valid` :161-170.
- Binary `verifyCommand` :217-244: `all.issueCount > 0` :234 or `!result.valid` :239 → `exitFailed` :122-124.
- Slash `slash.apps.module.ts` `Verify` case :322-337; failures :327, :335.
- `prompt-execute.module.ts:311` gates `execute` on `Prompts.verifyPrompt(prompt)`; `:318` renders `verifyReport`.
- Interactive `interactive.apps.module.ts:200` notifies `verifyReport`.

### 4. Fields the two artifact verifiers do NOT check

| Verifier | Checks | Does **not** check |
|---|---|---|
| `pi-profiles` `verifyProfileFile` (`pi-profiles.module.ts:157-181`) | frontmatter exists, `name` slug + dir match, `description`, body title/instructions/checklist | **`skills` names are never resolved**, `model` format/pin, body beyond the three sections |
| `pi-prompts` `verifyPrompt`/`verifyPromptFile` (`prompts.module.ts:407-575`) | JSON, `name` slug + file match, `description`, non-empty `template`, template grammar, variable coverage/order/legal/required+default | **`skills` names are never resolved**, `model` format/pin |

Both `skills` and `model` are declared fields of the artifact (profiles frontmatter,
prompt JSON) that no verifier reads. `pi-profiles`'s *engine* (`verifyAll`) closes
the `skills` gap by delegating to `pi-skills`, but the pure verifier — used by
`list --status valid`, the interactive detail panel, and `filterByStatus` — does not.
`pi-prompts` has no equivalent engine check; the gap is total there.

### 5. Experiment — unresolvable `skills:` name (fixture under `/tmp/opencode/a001-exp`)

Fixture (only a throwaway profile + prompt; `.agents/skills/` exists but is empty):
```
/tmp/opencode/a001-exp/.agents/@montflow/profiles/exp-bot/PROFILE.md
---
name: exp-bot
description: A throwaway profile for the A001 skills-reference experiment.
model:
skills:
  - totally-nonexistent-skill-xyz
---

# Exp Bot

## Instructions

Do nothing. ...

## Review Checklist

- [ ] This profile is only a fixture

/tmp/opencode/a001-exp/.agents/@montflow/pi-prompts/exp-prompt.json
{ "name": "exp-prompt", "description": "Throwaway prompt ...",
  "template": "Say {{thing}}.", "variables": [ { "name": "thing" } ],
  "skills": ["totally-nonexistent-skill-xyz"], "model": "" }
```

**Prompts store — verifies CLEAN (gap confirmed):**
```
$ bun run --cwd packages/pi-prompts cli verify --all --dir /tmp/opencode/a001-exp
1 prompt · 0 issues
EXIT=0
```
```
$ bun run --cwd packages/pi-prompts cli list --status valid --dir /tmp/opencode/a001-exp
exp-prompt
EXIT=0
```

**Profiles store — the ENGINE catches it (contradicts the task premise):**
```
$ bun run --cwd packages/pi-profiles cli verify --dir /tmp/opencode/a001-exp
exp-bot: ✗ not verified — 1 issue
  skills: Skill 'totally-nonexistent-skill-xyz' is not installed under .agents/skills/.
1 profile · 1 issue
error: script "cli" exited with code 1
EXIT=1
```
Reason: `verifyAll` folds `SkillCheck` verdicts (`engines.apps.module.ts:68-82`);
`skill-check/module.ts:79-85` turns an unknown skill into a `skills` issue. This
check landed 2026-10-12 (`f2615bc`), **after** `SPEC.md` was authored 2026-10-07.

**Profiles store — the PURE verifier verifies CLEAN (gap confirmed at that layer):**
```
$ bun run --cwd packages/pi-profiles cli list --status valid --dir /tmp/opencode/a001-exp
• exp-bot — A throwaway profile for the A001 skills-reference experiment.
EXIT=0
```
`list --status valid` uses `verifyProfileFile` only (`engines.apps.module.ts:258`),
which never reads `skills`. The interactive detail panel shows the same clean line.

Takeaway for A004: prompts needs a skills resolver from zero; profiles already has
one at the engine layer but it lives outside `verifyProfileFile`, skips silently when
`@montflow/pi-skills` is unavailable (`warning`, issueCount 0 → exit 0), and is
bypassed by `list --status`/the detail panel. No `skills:`-reference gate exists for
either artifact's *pure* verifier.

### 6. Report-only verification modes

| Package | `verify:montflow:*` gate (`package.json:25-31`) | Report-only verb? | Writes? |
|---|---|---|---|
| pi-specs | `cli check --dir $PWD` (:27) | `check` is inherently report-only; **no `--check` on `doctor`** (`cli.apps.module.ts:908`, flagless) | `check` never writes; `doctor` installs skills |
| pi-profiles | `cli verify --dir $PWD` (:28) | `verify` is inherently report-only; **no `doctor` command at all** | `verify` never writes |
| pi-prompts | `cli verify --all` + `cli doctor --check` (:26) | `verify` report-only; `doctor --check` report-only (`binary.apps.module.ts:129-132`) | `doctor` without `--check` installs/repairs |
| pi-skills | `verify` + `doctor --check` (:25) | `doctor --check` (`binary.apps.module.ts:101`) | `doctor` without `--check` |
| pi-reviews | `verify --all` + `doctor --check` (:30) | `doctor --check` (`binary.apps.module.ts:68`) | `doctor` without `--check` |
| pi-sessions | `cli doctor` — **no `--check`** (:29) | `doctor --check` exists (`commands.apps.module.ts:258-259`) but the gate does not use it | the gate script itself installs |

So `pi-specs` (`check`) and `pi-profiles` (`verify`) are report-only by construction
but expose no `doctor --check`; `pi-prompts`/`pi-skills`/`pi-reviews` expose a
report-only `doctor --check`; the `pi-sessions` gate script calls writing `doctor`.

### 7. Fixture / status vocabulary already in use

- **Spec fixtures** live at `packages/pi-specs/fixtures/.agents/@montflow/specs/`:
  `mock-ok` (clean, pending), `mock-complete` (clean, complete), `mock-stale`
  (bookkeeping contradiction → `inconsistent`), `mock-bad` (10 failure classes).
  Documented `packages/pi-specs/fixtures/README.md:8-20`; asserted
  `packages/pi-specs/src/apps/cli/tests/fixtures.test.ts:11,21,37,46`. No fixtures
  dir exists in `pi-profiles` or `pi-prompts`.
- **`stale` is already a doctor status word**: `pi-prompts` doctor uses
  `ok | missing | stale | installed | repaired | mismatched`
  (`apps/doctor/doctor.apps.module.ts:66`), aggregate `ok | repaired | drifted`
  (:81). `stale` = "installed but bytes differ from the package" — unrelated to
  `mock-stale` (which means a lifecycle bookkeeping contradiction). A new warning
  must not reuse `stale` in either sense.
- Verify verdict words in fixtures/messages: `✓ verified` / `✗ not verified`
  (`infoLine` in all three packages); `valid`/`invalid` are the `list --status`
  filter tokens (`pi-profiles engines:93`, `pi-prompts engines:~`).

## Open Questions

- Folding severity into `Issue` will also silently change `lifecycle.verify`'s
  `Result` (:90), which `analyze` maps to the string state `'inconsistent'`
  (:177). Is a warning-severity lifecycle issue supposed to keep producing
  `inconsistent`, or should `inconsistent` require an error? (Parked for A003.)
- `pi-profiles`'s engine skill check is soft (missing `@montflow/pi-skills` → warning,
  exit 0). Should A004 make a skipped skill check fail, or keep it advisory?
  (Parked for A003/A004.)

## Handoff

- A003 (severity): exact `Issue`/`Result` consumer list above; `pi-specs` `Issue`
  has no `fix`/`line` to extend, while `pi-prompts` `VerifyIssue` is the template to
  copy; `pi-specs` exit sites are `cli.apps.module.ts:775-779` and `:792-796`
  plus `ok` at `:1091`/`:1132`; `pi-profiles` exit at `binary.apps.module.ts:143`.
- A004 (skills resolution): prompts verifies a bogus `skills:` name clean
  (quoted experiment); profiles' pure `verifyProfileFile`/`list --status valid`/detail
  panel do too, while its engine `verifyAll` already catches it. Build on
  `skill-check.module.ts` (`checkSkills`) rather than reinventing resolution.

## Deviations

- `TASK.md` names a `runCheck` consumer and expects profiles to verify a bogus
  `skills:` name clean **"in both stores"**. At the CLI engine level `mf-profiles
  verify` does **not** verify clean (quoted in Findings §5); it reports the miss and
  exits 1, because the skill check landed 2026-10-12 (`f2615bc`), after the spec was
  authored. The premise holds only for the pure verifier
  (`list --status valid` / detail panel) and fully for prompts. Reported as observed
  rather than reproduced as assumed. `runCheck` does not exist in the codebase.
- No file outside `.agents/@montflow/specs/` was modified; fixtures were written to
  `/tmp/opencode/a001-exp`.
