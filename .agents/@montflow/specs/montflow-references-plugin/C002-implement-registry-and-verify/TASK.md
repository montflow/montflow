---
id: C002
name: implement-registry-and-verify
type: execution
originator: user
depends-on: C001, B001
related-tasks:
status: complete
---

# Task C002: Implement the registry store and verifier

## Type: execution

## Description

Implement the `Reference` schema class, the `REFERENCE.md` codec, the committed
store, the derived clone path, the clone-state probe, and the mechanical
verifier. This is the package's domain core; no CLI or plugin surface yet.

## Requirements

- Implement `Reference` as an Effect `Schema.Class` with `name`, `url`, `purpose`, `added`, and optional `ref`, plus slug validation and the derived clone path helper.
- Implement `REFERENCE.md` decode/encode: frontmatter grammar shared with the verifier, body preserved, unknown fields rejected or ignored per the B001 decision.
- Implement the `ReferenceStore` service under `src/services/reference-store` over `<root>/.agents/@montflow/references`: list, read raw, read one, write, remove, and existence; a missing root reads as empty.
- Implement the clone probe for `<root>/.agents/references/<slug>`: present, is a git work tree, clean/dirty, current ref, and whether it matches the recorded `ref`.
- Implement `verifyReferenceFile` and `verifyStore` returning issues that name the entry and field: slug, url, ref, purpose, added, duplicate slug, duplicate URL, directory/name mismatch.
- Keep `verifyStore` clone-free; expose the clone checks as a separate additive option used by `verify --clones`.
- Cover valid, invalid, duplicate, ref, date, and path cases with unit tests.
- `bun run --cwd packages/references test` and `ts:check` pass.
- No file outside `packages/references/` and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] `Reference` class, codec, store, and clone probe implemented
- [ ] Verifier reports every B001 rule with entry and field
- [ ] Unit tests cover valid, invalid, duplicate, and clone-state cases
