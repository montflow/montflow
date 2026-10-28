# Memory

## Context

None yet.

## Progress

- pending

## Open Questions

- None.

## Handoff

- See TASK.md.

## Deviations

- None.
# C001: fix-plugin-host-loading - Memory

## Changes
- Aligned effect versions to 4.0.1 across repo (root overrides, all packages). @opencode/plugin/schema remain at 2.0.18 per repo pins; host provides them. Host forces its own effect copy - aligning to 4.0.1 matches host.
- Fixed imports to use subpaths where needed (packages/prompts already uses @effect/platform-node subpaths). No deep effect/dist imports found.
- No @opencode/schema runtime construction that would hit removed APIs - codebase uses Schema from effect and types from @opencode/schema; no Schema.isStartsWith usage found.

## Verification
- packages/opencode test: all passed (28 files, 146 tests)
- packages/opencode smoke (plugin-loader): 12 pass
