# Review: prompts-construct-wizard / 001

## Metadata

- Target: Phase A: construct engine, wizard, CLI wiring
- Round: 001
- Phase: A
- Type: standalone
- Isolation: non-isolated (orchestrator has no subagent tool; the reviewer and the implementer share the session)
- Max Attempts: 3
- Status: open
- Created: 2026-11-15

## Findings

### F1 — Interactive menu still exposes the removed `render`/`execute` verbs

- Severity: Major
- Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts` (`parseAction` cases, prompt submenu, `run` dispatch)
- Status: Resolved
- Attempts: 0
- First Seen: 001
- Problem: The SPEC requires that "the two overlapping `render` and `execute` commands are removed from the binary, the slash command, and the interactive menu." The binary and the slash command were updated, but the interactive `/mf-prompts` menu still parses `render` and `execute` (`parseAction`), still lists "Fill & render" and "Execute" in the per-prompt submenu, and still dispatches them in `run`. A user in the interactive menu can still invoke the two confusing commands this spec set out to remove.
- Impact: The interactive surface keeps the exact confusion the spec resolves — two commands that overlap with `construct` still reachable from the menu.
- Suggestion: Remove the `Render`/`Execute` action kinds, the `render`/`execute` `parseAction` cases, the "Fill & render" / "Execute" submenu entries, and the `run` cases that dispatch them from `apps/interactive/interactive.apps.module.ts`.

#### Discussion

[Fixer] Removed the `Render`/`Execute` variants from the `Action` type and their `parseAction` cases and `run` dispatch; added a `Construct` action that fills inputs interactively and renders through the shared `renderValues`/`PromptExecute` path. The interactive `parseAction` tests were updated accordingly.
[Reviewer] Verified in `packages/prompts/src/apps/interactive/interactive.apps.module.ts`: no `Render`/`Execute` action kinds or `parseAction`/`run` cases remain; the interactive menu now routes `construct` through the shared fill-and-render path. Resolved.

### F2 — Wizard reads the profile store twice for a profile-shaped select

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts` (`askOne`, the profile branch)
- Status: Resolved
- Attempts: 0
- First Seen: 001
- Problem: `isProfileVariable(variable) && (yield* profileOptions(cwd)).length > 0 ? yield* profileOptions(cwd) : [...]` calls `profileOptions(cwd)`, which runs `ProfileStore.list(cwd)`, twice when the condition holds — once for the guard and once for the value.
- Impact: A redundant filesystem `list` per profile-shaped question. Small but avoidable I/O.
- Suggestion: Read the profile list once into a local, then test and use it.

#### Discussion

[Fixer] `askOne` now reads `profileOptions(cwd)` once into `listed` and tests/uses that single read; the redundant second store `list` is gone.
[Reviewer] Verified in `askOne`: the profile branch now does one `yield* profileOptions(cwd)` into `listed` and reuses it. Resolved.

### F3 — A blank "recommended fallback" answer is indistinguishable from unanswered in back-navigation

- Severity: Minor
- Location: `packages/prompts/src/apps/interactive/interactive.apps.module.ts` (`constructWizard` forward-skip, `askable`)
- Status: Resolved
- Attempts: 0
- First Seen: 001
- Problem: Choosing "Use recommended fallback" stores `''`, so `state.values[name]` is empty — the same value as "not yet answered". The forward-skip test treats an answered-with-fallback variable as unanswered. The current flow advances past every answered variable, so no live path re-asks it, but the invariant is fragile: any change to forward traversal could re-ask a fallback-answered variable and make the wizard loop.
- Impact: A latent risk, not an active bug in the tested flows.
- Suggestion: Track answered variables separately from their value so back-navigation and forward-skip agree on what was answered.

#### Discussion

[Fixer] `WizardState` now carries an `answered: Set<string>`; the forward-skip tests `state.answered.has(name)` (a blank "use fallback" answer is recorded), and an answer adds to the set.
[Reviewer] Verified in `constructWizard`: the forward-skip and back-navigation now use the `answered` set, so a blank fallback answer is never re-asked on forward traversal. Resolved.

### F4 — `consoleUi` readline interface is never closed

- Severity: Minor
- Location: `packages/prompts/src/apps/cli/binary.apps.module.ts` (`consoleUi`)
- Status: Resolved
- Attempts: 0
- First Seen: 001
- Problem: The `--wizard` console UI opens a `node:readline/promises` interface on `process.stdin` and never closes it. In an interactive TTY this can keep stdin open and delay process exit after the wizard completes.
- Impact: The CLI may not exit promptly after an interactive `--wizard` run.
- Suggestion: Close the interface when the wizard flow finishes.

#### Discussion

[Fixer] `consoleUi` now returns `{ ui, close }`; the binary's `--wizard` path closes the readline via `Effect.ensuring` after the wizard completes (including on failure).
[Reviewer] Verified in `binary.apps.module.ts`: the `--wizard` path calls `console.close()` through `Effect.ensuring`, so the readline interface is released when the flow settles. Resolved.

## Summary

# Finding counts by severity, then by status. Keep both in step with the findings above.
- Critical: 0
- Major: 1
- Minor: 3
- Nit: 0
- Open: 0
- In Review: 0
- Resolved: 4
- Won't Fix: 0
- Escalated: 0
