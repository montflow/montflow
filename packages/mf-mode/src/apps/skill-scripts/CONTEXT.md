# Skill scripts

Tests for the script that ships inside `skills/`: `mf-mode-observe`'s
`scripts/emit.sh`, the appender the lead and its workers call.

## Rules

- **The script lives in the skill.** It runs from the installed copy under
  `.agents/skills/` with nothing but bash, so appending costs no runtime.
- **Its tests live here.** vitest covers `src/`, and the tests do not ship
  with the skill.
- **The event shape is shared with `../../modules/trace/`.** The round-trip
  tests pipe `emit.sh` output through `parseTrace`, so a kind or field one
  side drops fails here.
