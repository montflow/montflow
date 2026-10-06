---
name: montflow-modify-pi-skills
description: Modifies, updates, extends, or audits an existing workspace skill under .agents/skills/<name>/ while keeping the pi-skills schema valid. Use when an agent must edit a skill, add to it, or fix its shape without dispatching a run.
id: c0eec01fb3fdeac6
author: montflow
version: 1.0.0
license: MIT
groups:
  - skills
dependencies:
  - executing-skills
---

# When To Use

Use when an existing **workspace skill** under `.agents/skills/<name>/` must be
modified, extended, audited, or brought back into the standard shape. The agent
edits the files itself — it does not dispatch a run.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md)
> skill before running this pipeline. It governs how skills are loaded,
> executed, and verified.

# Pipeline

## 1. Identify the Target

Confirm which skill to change; if unspecified, ask. Locate it at
`.agents/skills/<name>/` and list its files.

## 2. Load the Current State

Read `SKILL.md` and every supporting file. Note the frontmatter (`name`, `id`,
`author`, `version`, `license`, `groups`, `dependencies`) and the body's three
sections.

## 3. Plan and Confirm the Change

Outline what changes, whether `version` should increment (patch for fixes, minor
for additions, major for restructuring), and whether `CHANGELOG.md` needs an
entry. Present the plan before editing.

## 4. Edit

- Keep the schema valid: `name` still equals the directory; `id` never changes;
  `# When To Use`, `# Pipeline`, and `# Reference` stay present.
- Preserve frontmatter fields you are not intentionally changing.
- Keep the description saying WHEN to use the skill.
- Reference existing skills only; do not invent dependency names.
- Update `CHANGELOG.md` when the change is user-visible.

## 5. Self-Check Before You Stop

- `name`, `id`, `author`, `version`, and `description` are still valid.
- The three body sections are present.
- Verify mechanically, then fix every issue it reports:

```bash
mf-skills verify <name>          # the binary, scriptable
/mf-skills verify <name>         # the same command inside a Pi session
```

- Nothing outside the target skill directory was touched.

# Reference

- **Skill format**: `.agents/skills/<name>/SKILL.md` — one directory per skill.
- **Creation standard**: [montflow-create-pi-skills](../montflow-create-pi-skills/SKILL.md).
- **Contract source**: `packages/pi-skills/src/modules/skill/skill.module.ts` (`verifySkillFile`).
