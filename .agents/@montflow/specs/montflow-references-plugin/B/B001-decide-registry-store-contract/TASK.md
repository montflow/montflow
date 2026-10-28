---
id: B001
name: decide-registry-store-contract
type: planning
originator: user
depends-on: A001, A003
related-tasks:
status: complete
---

# Task B001: Decide the registry store contract

## Type: planning

## Description

Fix the committed registry contract before any code is written: entry path,
frontmatter fields, ref semantics, clone-path derivation, duplicate policy, and
the exact migration mapping for the 14 existing rows. The contract must let a
fresh CI checkout verify the registry without any clone present.

## Requirements

- Decide the entry path and name rule: `.agents/@montflow/references/<slug>/REFERENCE.md`, slug equals directory and frontmatter `name`, kebab-case validation.
- Decide the frontmatter fields and types: `name`, `url`, `purpose`, `added`, optional `ref`; decide whether `ref` accepts branch, tag, and commit, and how an empty `ref` reads (default branch).
- Decide the body contract: what notes belong in `REFERENCE.md` versus what is derived at read time.
- Decide clone-path derivation (`<root>/.agents/references/<slug>`) and state that the path is never stored in the entry.
- Decide duplicate policy: duplicate slug and duplicate URL are verification failures; state whether a URL may be registered twice under different names and why.
- Decide the migration table: all 14 rows mapped to slug, URL, purpose, and `ref`, including the `opencode` pin the specs cite.
- Write one complete example entry and one invalid-entry example in MEMORY.md.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Entry path, frontmatter, body, and clone-path rules decided with examples
- [ ] Duplicate and ref semantics decided
- [ ] 14-row migration table recorded
