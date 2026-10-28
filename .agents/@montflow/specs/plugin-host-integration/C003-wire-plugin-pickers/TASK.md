---
id: C003
name: wire-plugin-pickers
type: execution
originator: user
depends-on: C002
related-tasks: B001, C002
status: done
---

# Task C003: wire-plugin-pickers

## Type: execution

## Description

Give every montflow plugin its picker by calling the shared contract. Prompts is
already the reference implementation; skills, specs, profiles, and reviews follow
the same shape with their own store reader and insertion rule.

## Requirements

- `prompts` — `/mf-prompts` with no arguments (or `list`) opens the picker and
  pastes the chosen template, variables intact.
- `skills` — lists `.agents/skills` and pastes the skill name.
- `specs` — lists `.agents/@montflow/specs` and pastes the spec name.
- `profiles` — lists `.agents/@montflow/profiles` and pastes the profile name.
- `reviews` — lists `.agents/@montflow/reviews` series (and their rounds) and
  pastes the series name, or `series/round` when a round is chosen.
- Each picker hangs off the plugin's single namespaced command; a plugin does not
  gain a second command name just to open a modal.
- Every picker is a directory-shaped plugin part (`tui.ts` beside `server.ts`)
  so the TUI discovers it.
- No plugin reimplements dialog, search, or insertion; each supplies data and a
  formatter only.
- Scoped package checks pass for every package touched.

## Completion

- [ ] Five pickers registered through the shared contract.
- [ ] Each insertion rule matches the B001 table.
- [ ] Scoped checks green.
