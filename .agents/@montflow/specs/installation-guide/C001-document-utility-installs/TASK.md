---
id: C001
name: document-utility-installs
type: execution
originator: user
depends-on: A001
related-tasks: C002, C003, A002
status: complete
---

# Task C001: document-utility-installs

## Type: execution

## Description

Give every utility CLI its own optional section in `guides/installation.md`:
`mf-skills`, `mf-specs`, `mf-prompts`, `mf-profiles`, `mf-reviews`. One section
shape, repeated, so a reader can compare them at a glance and skip the ones they
do not want.

## Requirements

- Every package with an `mf-*` CLI has a section: `skills`, `specs`, `prompts`,
  `profiles`, `reviews`. Packages without a CLI (the `opencode` adapter,
  `workflows`) get no install section.
- Each section is marked optional and says what the utility adds, the store path
  it owns under `.agents/@montflow/<domain>`, the commands that create and verify
  it, and how to tell it is working.
- Each section names the exact commands, copy-pasteable against `--dir <target>`,
  with the clone path as a variable rather than a hardcoded home directory.
- Sections are ordered so a reader can stop after any one of them; none assumes
  another was installed.
- The sections reuse the command shapes already documented by each package's
  CLI (`doctor`, `verify`/`check`, `--dir`) instead of inventing a new surface.
- No section references a plugin config array, a harness, or a global install.

## Completion

- [ ] Five utility sections exist, each marked optional and independently
      runnable.
- [ ] Every command in a section matches the package's actual CLI surface.
