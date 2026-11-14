---
name: finding-skills
description: Discovers and surfaces available skills matching user requests. Use when the user asks "what skills do you have", "how do I do X", or wants to find a skill for a specific task.
id: ed431fe5f6f7a06b
author: Daniel Montilla
version: 1.2.0
license: MIT
dependencies:
  - executing-skills
groups:
  - skills
---

# When To Use

Use when the user asks "what skills do you have", "how do I do X", or wants to find a skill for a specific task.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Detect Trigger

User asks about capabilities, how to do something, or what skills exist.

## 2. List Skills

Try the CLI first — it prints every skill name with its description in one pass:

```
mf-skills list
```

Read a full contract with `mf-skills show <skill>`. Where the binary is not on
`PATH`, use the in-repo form:

```
bun run --cwd packages/skills cli list --dir "$PWD"
```

**Fallback**: only when `mf-skills` is unavailable, scan
`.agents/skills/*/SKILL.md` with Glob and Grep, matching keywords against each
skill's `name` and `description`. State that the fallback was used.

## 3. Match Intent to Skill

Compare user request against each skill's `name` and `description`. Present matches with a brief summary of each.

## 4. Handle No Match

If no skill matches, suggest creating a new one using `authoring-skills`.

# Reference

- See [available skills list](../) for all installed skills
