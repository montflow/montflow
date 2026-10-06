---
name: montflow-create-pi-skills
description: Authors a workspace skill under .agents/skills/<name>/ — a SKILL.md with the required frontmatter and `# When To Use` / `# Pipeline` / `# Reference` body — from the rules below. Use when an agent must create a skill directly, without dispatching a run or shelling out.
id: 94b1651acdb76a86
author: montflow
version: 1.0.0
license: MIT
groups:
  - skills
dependencies:
  - executing-skills
---

# When To Use

Use when a new **workspace skill** must be authored under
`.agents/skills/<name>/`. The agent writes `SKILL.md` itself from the rules
below — it does not dispatch a run and does not call a CLI to create the file.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md)
> skill before running this pipeline. It governs how skills are loaded,
> executed, and verified.

# Pipeline

## 1. Choose the Name

`<name>` is a kebab-case slug (lowercase alphanumeric groups joined by single
hyphens) and becomes both the directory name and the frontmatter `name`. Create
exactly one skill, then stop. If a skill with that name already exists, pick a
fresh name.

## 2. Write the Frontmatter

`SKILL.md` opens with a `---` block. These fields are required:

| Field         | Rules                                                                   |
| ------------- | ----------------------------------------------------------------------- |
| `name`        | kebab-case; must equal the directory name                               |
| `description` | one or two sentences saying WHEN to use the skill (it drives selection) |
| `id`          | exactly 16 lowercase hex chars, immutable once set                      |
| `author`      | who maintains the skill                                                 |
| `version`     | SemVer, starting at `1.0.0`                                             |

Optional: `license` (defaults to MIT), `groups` (list), `dependencies` (list of
skill names to load first).

Generate the `id` once, then never change it:

```
uuidgen | tr -d '-' | cut -c1-16 | tr 'A-Z' 'a-z'
```

## 3. Write the Body

The body has exactly these three top-level sections:

- `# When To Use` — the trigger conditions; when the agent should apply this skill.
- `# Pipeline` — the numbered steps. Use `##` for steps and `###` for sub-steps.
  Give concrete inputs, outputs, and edge cases.
- `# Reference` — links to files in the skill directory and the contract source.

Keep it compressed: the body loads into agent context on every use, so no filler.

## 4. Optional Supporting Files

Add only what the skill needs: `CHANGELOG.md` (dated entries), `references/`,
`templates/`, or `scripts/`. Reference each one from `# Reference`.

## 5. Self-Check Before You Stop

- The directory name equals frontmatter `name`.
- `id` is 16 lowercase hex chars; `version` is SemVer; `author` and `description` are non-empty.
- The body has `# When To Use`, `# Pipeline`, and `# Reference`.
- Verify mechanically, then fix every issue it reports:

```bash
mf-skills verify <name>          # the binary, scriptable
/mf-skills verify <name>         # the same command inside a Pi session
```

- Nothing outside `.agents/skills/` was touched.

# Reference

- **Skill format**: `.agents/skills/<name>/SKILL.md` — one directory per skill.
- **Contract source**: `packages/pi-skills/src/modules/skill/skill.module.ts` (`verifySkillFile`).
- **Executor skill**: [executing-skills](../executing-skills/SKILL.md).
