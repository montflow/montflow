---
id: A001
name: rewrite-installation-guide
type: execution
originator: user
depends-on:
related-tasks: A002
status: complete
---

# Task A001: rewrite-installation-guide

## Type: execution

## Description

Rewrite `guides/installation.md` around the two modes readers arrive in, with no
harness-specific installation anywhere.

**Remote mode** — the reader has no montflow checkout. The agent adds montflow
to `.agents/references/` (the `adding-references` pipeline), reads the reference
inventory (`finding-references`), then continues into local mode against that
clone.

**Local mode** — the reader has a checkout on disk. Skills come from
`mf-skills sync`, the `mf-*` CLIs run from the clone, and verification uses the
existing `--dir` convention.

## Requirements

- Remote mode comes first, and states it is mandatory for the agent to register
  the montflow reference and read the reference skill before installing.
- Remote mode hands off to local mode explicitly; there is one installation
  procedure, entered from two directions.
- Local mode documents `mf-skills sync --dir <target>` against the checkout,
  including `--check` for verification, and never the `npx skills` CLI.
- The guide removes every OpenCode-era section: plugin arrays, packing,
  `opencode plugin add`, `/reload`, the dashboard, global config, and the
  OpenCode skill-discovery tables and troubleshooting.
- Global installs are explicitly discouraged: sync is project-local by design,
  and nothing in the guide points at a machine-wide skill directory.
- Remaining plugin material is at most a pointer that `@montflow/*` packages are
  private and installed by their own adapter docs.
- Every command in the guide is copy-pasteable from a fresh workspace and names
  a `--dir` when it writes.

## Completion

- [ ] Remote and local modes are both present, in that order, and cross-linked.
- [ ] No OpenCode-specific config, path, or command survives in the guide.
- [ ] `mf-skills sync` is the only documented skills-install path.
