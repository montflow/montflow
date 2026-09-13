---
name: authoring-profiles
description: Guides the creation, formatting, and refinement of agent profiles (PROFILE.md). Use when the user wants to write a new profile, convert a role description into a profile, or audit an existing profile.
groups:
  - profiles
dependencies:
  - executing-skills
---

# When To Use

Use when the user asks to create a new agent profile, convert a role description into a profile, or audit/improve an existing profile. A profile is a named agent definition: one line saying what the agent is, plus the system-prompt instructions and review checklist it runs with.

# Profile Format

A profile is one directory, `.agents/@montflow/pi-profiles/<name>/`, holding a single `PROFILE.md`:

```markdown
---
name: <kebab-case-name>
description: <one line: the agent's role and what it does>
model: <provider/model-id, or blank when unset>
skills:
  - <skill-name>
---

# <Profile Name>

## Instructions

<Custom system-prompt instructions. How the agent should behave, what to focus on, what to avoid.>

## Review Checklist

- [ ] <What the reviewer must verify before the work is done>
```

Field rules:

- `name`: kebab-case slug, matches the directory name. Must equal the file's directory.
- `description`: one line saying WHAT the agent is — its role and job. It drives profile selection, so lead with the role.
- `model`: preferred model as `provider/model-id`, or blank when unset. Never invent a model id.
- `skills`: names from `SKILL.md` frontmatter `name:` fields. List `.agents/skills/` and read each frontmatter `name:` before referencing — reference existing skills only, otherwise leave skills empty or omit the key. Profiles never activate skills themselves; consumers load them.
- `## Instructions`: the custom system prompt. Concrete behavior, focus areas, and avoidances. Short sections and bullets over prose.
- `## Review Checklist`: at least one verifiable `- [ ]` item the work must satisfy before it is done.

# Pipeline

## 1. Gather Requirements

Check what the user already provided. Only ask for what's missing:

- [ ] **Profile name**: kebab-case, fits the role (e.g. `code-reviewer`, `security-auditor`)
- [ ] **Role**: what the agent is and what it does (one line — becomes the description)
- [ ] **Instructions**: how it should behave, what to focus on, what to avoid
- [ ] **Checklist**: what must be verified before the work is done
- [ ] **Model**: preferred `provider/model-id`, if any (blank otherwise)
- [ ] **Skills**: which workspace skills it must load, if any

If anything is still unclear, **ask the user** before proceeding.

## 2. Scaffold

Create `.agents/@montflow/pi-profiles/<name>/PROFILE.md` with the format above. If a profile with that name already exists, pick a fresh name instead. Do not touch anything outside `.agents/@montflow/pi-profiles/`.

## 3. Verify

- [ ] Frontmatter parses: `name` matches the directory, `description` is one non-empty line
- [ ] Every skill in `skills:` exists under `.agents/skills/` (checked via frontmatter `name:`)
- [ ] `## Instructions` is non-empty and actionable
- [ ] `## Review Checklist` has at least one item
- [ ] Nothing outside the profile directory was modified

# Mechanical Reference

For exact commands, paths, and schema, see [CLI.md](../../../packages/pi-profiles/CLI.md) —
headless `/mf-profiles-cli` reference for agents and scripts (RPC invocation,
command flags, `PROFILE.md` schema). Prefer the CLI over hand-writing files.

# What a Profile Never Does

1. Never activates itself — a consumer loads it.
2. Never runs code — `PROFILE.md` is data (frontmatter plus markdown), no tools or commands.
3. Never switches models itself — `model` is a preference the consumer reads.
4. Never resolves its own skill dependencies — consumers load those.
