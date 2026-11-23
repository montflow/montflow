# Skill scripts

Tests for the scripts that ship inside `skills/`: `mf-mode-observe`'s
`scripts/emit.sh` and `mf-mode-report`'s `scripts/report.ts`.

## Rules

- **The scripts live in the skill.** They run from the installed copy under
  `.agents/skills/`, so they import nothing outside the Node standard library.
- **Their tests live here.** vitest and `tsc` cover `src/`, and the tests do
  not ship with the skill. `report.ts` is type-checked through the test's import.
- **The trace event shape is shared.** `emit.sh` writes it and `report.ts`
  parses it. The round-trip tests pipe one into the other, so a kind or field
  one side drops fails here.
