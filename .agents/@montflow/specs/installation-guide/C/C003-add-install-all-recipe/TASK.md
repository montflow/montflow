---
id: C003
name: add-install-all-recipe
type: execution
originator: user
depends-on: C001, C002
related-tasks: C001, C002
status: complete
---

# Task C003: add-install-all-recipe

## Type: execution

## Description

Add the install-all path: one copy-paste recipe that sets up every utility in
order and verifies each, for readers who answered "all" or who want everything
without reading five sections.

## Requirements

- The recipe runs each utility's setup and verification in a fixed order, with
  the clone path as a variable.
- It stops on the first failure and reports which utility failed; it does not
  swallow a non-zero exit.
- It ends with a summary the agent can paste back: which utilities installed,
  which verified clean, which failed.
- The recipe is a documentation artifact only — no new CLI command, no wrapper
  script committed to the repository.
- It stays consistent with the per-utility sections: same commands, same flags,
  no divergence.

## Completion

- [ ] One recipe installs and verifies every utility, with a documented order and
      failure behaviour.
- [ ] The recipe's commands match the per-utility sections verbatim.
