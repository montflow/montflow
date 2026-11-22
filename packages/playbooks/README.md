# @montflow/playbooks

Playbooks are procedures an agent runs end to end: a framing paragraph, the
steps or rules, and what the final reply must contain. This package owns their
store and ships the `mf-playbooks` CLI that lists, shows, verifies, and
installs them. It is harness-agnostic: there is no plugin face.

## Store

```
.agents/@montflow/playbooks/<name>/PLAYBOOK.md
```

```markdown
---
name: bug-fix
description: Reproduce a defect, root-cause it, and fix with runtime evidence.
skills: # optional; skill directory names under .agents/skills
  - mf-mode-why
principles: # optional; principle names in the principles store
  - fix-root-causes
playbooks: # optional; other playbooks this one runs
  - opening-a-pr
---

# Bug fix

<framing paragraph(s)>

1. <step>
2. <step>

## Reply

<what the final reply must contain>
```

`verify` fails on a missing or unreadable frontmatter block, a `name` that is
not kebab-case or not the directory name, an empty `description`, anything but
exactly one `# Title`, an empty body after it, and an empty `## Reply` section
(the section itself is optional). Every reference must exist under the same
workspace root:

| Field        | Must exist at                                      |
| ------------ | -------------------------------------------------- |
| `skills`     | `.agents/skills/<name>/SKILL.md`                   |
| `principles` | `.agents/@montflow/principles/<name>/PRINCIPLE.md` |
| `playbooks`  | `.agents/@montflow/playbooks/<name>/PLAYBOOK.md`   |

A body with no list item (`1.` or `-`) is a warning, never an error: some
playbooks are prose.

## Commands

```bash
mf-playbooks doctor [--check] [--dir <root>]          # install or check the packaged playbooks
mf-playbooks list [--human] [--verbose] [--dir <root>] # the index: `<name>: <description>`
mf-playbooks show <name> [--dir <root>]               # the PLAYBOOK.md bytes
mf-playbooks verify [<name>] [--all] [--human] [--verbose] [--dir <root>]
```

`--dir` is the workspace root, never the store. Single-artifact form, from the
workspace root:

```bash
bun run --cwd packages/playbooks cli verify <name> --dir $PWD
```

## Payload

`payload.json` ships `opening-a-pr`. `doctor` installs it; a locally edited
copy is `stale` and repair overwrites it; a playbook the package does not ship
is user data and is never touched.

The shipped playbooks are adapted from [pstack](https://github.com/cursor/plugins/tree/main/pstack)
by Lauren Tan, MIT licensed; the notice is in `LICENSE-pstack`.
