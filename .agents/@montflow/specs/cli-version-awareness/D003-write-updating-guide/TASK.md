---
id: D003
name: write-updating-guide
type: execution
originator: user
depends-on: B002, C002, D002
related-tasks:
status: pending
---

# Task D003: write-updating-guide

## Type: execution

## Description

Author `guides/updating.md` as the single destination every warning and document points at, and wire the installation guide and README to it.

## Requirements

- `guides/updating.md` covers reading the warning, `mf-<cli> version --check`, updating the checkout (`git pull` then `bun install`), re-syncing installed stores, verifying the result, and every opt-out.
- One section per CLI plus one for installed stores; each section ends with a command that proves the update took effect.
- `guides/installation.md` gains an `# Updating` section linking to the new guide, and `README.md` links it beside the install guide.
- The anchor the notice prints and the heading in the guide agree, and a check fails when a notice anchor has no matching heading.
- The `syncing-skills` skill mentions the manifest and the updating guide instead of only `--check`.
- Every step works offline against a local checkout; the network path is named as optional, never required.

## Completion

- [ ] Done.
