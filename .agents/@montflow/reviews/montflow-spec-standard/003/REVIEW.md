# Review: montflow-spec-standard / 003

## Metadata

- Target: Phase A — A001–A004 (verification/payload inventories, issue severity channel, artifact reference resolution)
- Round: 003
- Phase: A
- Type: standalone
- Isolation: isolated
- Max Attempts: 3
- Status: closed
- Created: 2026-11-03

## Findings

### F1 — A bare skill directory counts as an installed skill, so a broken reference still verifies clean

- Severity: Minor
- Location: `packages/prompts/src/modules/skill-check/skill-check.module.ts:24-28`, `packages/profiles/src/modules/skill-check/skill-check.module.ts:66-73`, `packages/profiles/src/modules/profiles/profiles.module.ts:228-239`
- Status: Resolved
- Attempts: 1
- First Seen: 003
- Problem: Both resolvers accept any name under `.agents/skills` (prompts filters to directories; profiles takes the shared store's entry names); neither requires `<name>/SKILL.md` nor decodes the skill. `verifyPrompt`/`verifyProfileFile` therefore treat a `skills:` entry whose directory exists but holds no skill as resolved. Confirmed with `/tmp/opencode/a004-dircheck`, where `.agents/skills/bogus/` is empty and both a prompt and a profile declare `bogus`: `pi-prompts verify --all` printed `1 prompt · 0 issues · 0 warnings` (exit 0), and `pi-profiles list --status valid` listed the profile as valid. `pi-profiles verify` catches it only because its engine re-verifies installed names through `checkOne`; `pi-prompts` has no second check, and the profiles pure surfaces (`list --status`, detail panel) never run the engine.
- Impact: The rail A004 exists to add still reports a broken reference as clean on `pi-prompts` and on the profiles pure surfaces; the two verifiers A004 claimed to align disagree on what "installed" means.
- Suggestion: Filter resolved names to directories containing `SKILL.md` (or decode through the skills store) in both resolvers, and add a test with an empty skill directory. The warn-by-default/`--strict` policy is unchanged.

#### Discussion

[Reviewer] Filed from the Phase A review, round 003. Re-derived from the resolver code and reproduced on a throwaway fixture under `/tmp/opencode/a004-dircheck`; the empty directory produced zero issues in prompts and a `valid` listing in profiles.

[Fixer] Both resolvers now require `<name>/SKILL.md`. `packages/prompts/src/modules/skill-check/skill-check.module.ts` stats each store directory and keeps only names whose manifest exists; `packages/profiles/src/modules/skill-check/skill-check.module.ts` applies the same filter to `SkillStore.names`. Tests: `packages/prompts/src/modules/skill-check/tests/skill-check.test.ts` seeds a manifest and asserts an empty directory is excluded; `packages/profiles/src/modules/skill-check/tests/skill-check.test.ts` adds the same empty-directory case. Verified with `bun run --cwd packages/prompts test` (603 passed) and `bun run --cwd packages/profiles test` (194 passed), both typecheck-clean.

### F2 — `--strict` is unreachable from the slash `verify` surfaces

- Severity: Minor
- Location: `packages/profiles/src/apps/cli/cli.apps.module.ts:163`, `packages/prompts/src/apps/cli/slash.apps.module.ts:208`
- Status: Resolved
- Attempts: 1
- First Seen: 003
- Problem: A004 adds `strict` only to the binary `verify` commands. `/mf-profiles-cli verify --strict` parses every token after `verify` as a profile name (`names: tokens.slice(1)`), so `--strict` becomes a requested profile and the run fails as an unknown profile (`Profile not found`); `/mf-prompts verify --strict` has no `strict` in its known flag set. No slash path can promote an unresolved reference to an error.
- Impact: The requirement "strict mode makes it an error" holds only for the binary. An agent using the slash surface cannot opt into the hard line, and the profiles slash command silently misreads the flag as a name.
- Suggestion: Add `strict` to the `Verify` action/flags in both slash parsers and thread it into `Engines.verify`/`verifyAll`; add a parser test for `verify --strict`.

#### Discussion

[Reviewer] Verified by reading `parseCliArgs` in both packages; the profiles `Verify` case has no flag parsing at all, and the prompts known-flag set for `verify` is `all`/`dir` only.

[Fixer] Both slash parsers now extract `--strict` before splitting the remaining tokens, so `verify --strict <name>`, `verify <name> --strict`, and bare `verify --strict` parse the same way. The action carries `strict: boolean`, and the run paths pass it to `verifyAll`/`verify` (`packages/profiles/src/apps/cli/cli.apps.module.ts`, `packages/prompts/src/apps/cli/slash.apps.module.ts`). Usage lines name the flag. Parser tests cover `verify alpha --strict` and `verify --strict alpha`; `bun run --cwd packages/prompts test` (603 passed) and `bun run --cwd packages/profiles test` (194 passed) are green.

### F3 — A004's MEMORY contradicts the warning behavior it shipped

- Severity: Nit
- Location: `.agents/@montflow/specs/montflow-spec-standard/A/A004-add-artifact-reference-resolution/MEMORY.md:196-199`, `packages/profiles/src/apps/cli/engines.apps.module.ts:118-122`
- Status: Resolved
- Attempts: 1
- First Seen: 003
- Problem: The Open Questions say "the pi-profiles engine no longer surfaces `SKILLS_ENGINE_WARNING` ... `resolveSkills` returns undefined and the standard check short-circuits." The code does surface it: `skillsEngineWarning` returns `SKILLS_ENGINE_WARNING` when resolution is undefined, skills were declared, and the engine is unavailable, and `verifyAll` places it in `warnings`.
- Impact: A future reader may remove or misdiagnose a live advisory path, and the record is not a reliable description of the code it shipped.
- Suggestion: Rewrite the Open Question to describe `skillsEngineWarning`, or delete it if the decision is settled.

#### Discussion

[Reviewer] Read the MEMORY claim against `engines.apps.module.ts`; the warning branch is present and exercised by the current tests.

[Fixer] Rewrote the Open Question to describe `skillsEngineWarning` and the `verifyAll` warning channel, and corrected the Handoff line that said `--strict` was binary-only (both are in `A/A004-add-artifact-reference-resolution/MEMORY.md`). No code change; the claim now matches `packages/profiles/src/apps/cli/engines.apps.module.ts`.

## Summary

- Critical: 0
- Major: 0
- Minor: 2
- Nit: 1
- Open: 0
- In Review: 0
- Resolved: 3
- Won't Fix: 0
- Escalated: 0

Verdict: pass — A001/A002 satisfy their read-only inventories, A003's severity channel and A004's main resolution paths are implemented and tested; only minor gaps remain.
