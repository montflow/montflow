---
name: syncing-skills
description: Installs skills from the montflow/montflow GitHub repo into the current project (or globally) via the npx skills CLI. Reads the repo to list what is available, presents the list to the user for selection, then installs the chosen skills non-interactively. Use when the user wants to install, sync, or update skills from this repo.
id: 2eb6346337a80569
author: Daniel Montilla
version: 3.0.0
license: MIT
metadata:
  internal: true
dependencies:
  - executing-skills
groups:
  - skills
  - workflow
---

# When To Use

Use when the user wants to install skills from the `montflow/montflow` GitHub repo into the current project or globally. This is a **guided installer** flow:

1. Read the repo → list what skills are available
2. Present the list → user decides which go
3. Install the chosen skills via `npx skills add`

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Read the Repo — List Available Skills

Fetch what is installable from the repo:

```bash
npx skills add montflow/montflow --list
```

This reads the repo and prints every installable skill with its description. `syncing-skills` is marked `metadata.internal: true`, so it never appears — and never installs by accident (it would be circular anyway).

**Fallback** (CLI unavailable/offline — names only):

```bash
curl -s https://api.github.com/repos/montflow/montflow/contents/.agents/skills | grep '"name"'
```

Prefer the CLI: it also gives descriptions and validates the repo resolves.

## 2. Present & Select

Print the full list to the user: `name — description`.

Ask the user which skills to install:

- **Specific skills** by name: `grilling`, `i-have-adhd`, `authoring-skills`...
- **All** (`--all`) — note that internal skills are excluded automatically

Validate every requested name against the fetched list. Warn on unknown names and drop them. Confirm the install target before installing:

| Choice | Flag | Effect |
|--------|------|--------|
| Agent | `-a pi` (default) | pi; also `claude-code`, `codex`, `cursor`, ... |
| Scope | none (default) | project-local (`.agents/skills/` in cwd) |
| Scope | `-g` | global (e.g. `~/.pi/agent/skills/`) |

## 3. Install

```bash
# selected skills → pi, project-local
npx skills add montflow/montflow -s grilling -s i-have-adhd -a pi -y

# everything → pi, global
npx skills add montflow/montflow --all -a pi -g -y

# let the CLI auto-detect the user's agents (interactive picker)
npx skills add montflow/montflow -s grilling
```

- `-y` skips confirmation prompts; omit it for an interactive pass.
- Existing installs are updated in place by the CLI — no manual diffing needed.

## 4. Verify

For each installed skill, confirm:

- `SKILL.md` exists at the target (`.agents/skills/<name>/` in project, or the agent's global skills dir)
- Frontmatter has valid `name` and `description`
- If the user expected an upgrade, the content/version changed from before

## 5. Report

Summarize: skill, version, location (project/global).

If the target is a git repo, ask whether to commit the `.agents/skills/` changes.

# Maintenance

- `npx skills list` — what's installed
- `npx skills update [name]` — update installed skills
- `npx skills remove [name]` — uninstall
- `npx skills find [query]` — search the ecosystem

# Reference

- **Source repo**: `https://github.com/montflow/montflow`
- **CLI usage**: `INSTALL.md` in the repo root
- **Skill authoring**: [authoring-skills](../authoring-skills/SKILL.md)
- **Skill execution**: [executing-skills](../executing-skills/SKILL.md)
