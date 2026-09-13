# Skill-filter module

Pure filter for the skills panel: tiered matching — exact substring
first (ranked best-first, so precision never loses to a fuzzy
lookalike), then Fuse.js typo-tolerant matching across name (weighted
first), id, and description, then a gappy-subsequence fallback for
sparse fragments. Lives here (not in pi-skills, which keeps a
zero-dep subsequence matcher) so the Fuse dependency stays in the
workspace TUI and out of the pi extension graph. `app.tsx` wires
these helpers to the `SkillSummary` rows the skills service loads.

## Belongs here

- `matchesFilter` label/query matching
- `Filterable` structural row plus `filterByQuery` (name, id, description)

## Does not belong here

- Skill file IO and parsing — that lives in `services/skills/`
- Rendering, keyboard handling, signals — those live in `app.tsx` plus
  `components/`
