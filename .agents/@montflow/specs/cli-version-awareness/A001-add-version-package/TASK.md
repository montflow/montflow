---
id: A001
name: add-version-package
type: execution
originator: user
depends-on: 
related-tasks:
status: pending
---

# Task A001: add-version-package

## Type: execution

## Description

Add a private `@montflow/version` package that answers "what build am I?" for every `mf-*` CLI: package name, package version, git commit, dirty flag, ref, and checkout root — with a JSON shape stable enough for an agent to parse.

## Requirements

- New package `packages/version`, name `@montflow/version`, `private: true`, scaffolded to the package-setup standard and picked up by the existing `packages/*` workspace glob.
- `describe` returns `{ name, version, commit, dirty, ref, checkout, source }`; `version` is read from the owning CLI's `package.json`, never hardcoded, and `source` records where it came from (`package` or `generated`).
- Git facts come from the checkout that contains the package; a compiled binary or a non-git install degrades to `version` only, with `commit`, `dirty`, and `ref` absent — never an error.
- The identity path performs no network I/O and no writes.
- Tests cover a git checkout, a dirty tree, a non-git directory, and a missing `package.json`.
- The package exports one namespace-style module entry from `src/index.ts`, matching the repo module conventions.

## Completion

- [ ] Done.
