# @montflow/principles

Principles are short conditional rules an agent applies in one situation
("Apply when debugging. Fix the fault, not where it surfaced."). This package
owns their store and ships the `mf-principles` CLI that lists, shows, verifies,
and installs them. It is harness-agnostic: there is no plugin face.

## Store

```
.agents/@montflow/principles/<name>/PRINCIPLE.md
```

```markdown
---
name: fix-root-causes
description: 'Apply when debugging. Trace each symptom back to the first place the system went wrong and fix it there.'
---

# Fix Root Causes

<one statement paragraph>

- <rule>
- <rule>
```

`verify` fails on a missing or unreadable frontmatter block, a `name` that is
not kebab-case or not the directory name, an empty `description` or one that
does not start with `Apply when`, anything but exactly one `# Title`, and an
empty body after it. A body longer than 60 lines is a warning.

## Commands

```bash
mf-principles doctor [--check] [--dir <root>]          # install or check the packaged principles
mf-principles list [--human] [--verbose] [--dir <root>] # the index: `<name>: <description>`
mf-principles show <name> [--dir <root>]               # the PRINCIPLE.md bytes
mf-principles verify [<name>] [--all] [--human] [--verbose] [--dir <root>]
```

`--dir` is the workspace root, never the store. Single-artifact form, from the
workspace root:

```bash
bun run --cwd packages/principles cli verify <name> --dir $PWD
```

## Payload

`payload.json` ships `fix-root-causes`. `doctor` installs it; a locally edited
copy is `stale` and repair overwrites it; a principle the package does not ship
is user data and is never touched.

The shipped principles are adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack)
by Lauren Tan, MIT licensed; the notice is in `LICENSE-pstack`.
