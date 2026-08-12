---
name: setup-agentic-repo
description: "Sets up a repository for agentic coding work — creates or rewrites AGENTS.md and the .agents/ structure. Enforces that AGENTS.md stays extremely concise and surface-level only: one-line purpose, key commands, entry points, pointers to depth. Use when initializing a repo for agent use, creating or maintaining AGENTS.md, or deciding what belongs in AGENTS.md vs elsewhere."
id: 375734b846b26e57
author: Daniel Montilla
version: 1.0.0
license: MIT
dependencies:
  - executing-skills
  - caveman-compression
groups:
  - workflow
---

# When To Use

Setting up a new repo for agent work, creating or rewriting AGENTS.md, or auditing whether AGENTS.md content belongs there. User says "set up this repo for agents", "create AGENTS.md", "slim down AGENTS.md", or asks what should go in AGENTS.md.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Locate Repo Root

Find the project root — the nearest directory governing the whole repo. AGENTS.md lives there. Check for an existing `.agents/` directory.

## 2. Draft AGENTS.md — Surface-Level Only

AGENTS.md is a **map, not the territory**. It points to where depth lives; it does not contain the depth. Keep it extremely concise.

Include only:

- **One-line purpose**: what the repo is
- **Key commands**: build, test, run, lint — one line each, no prose
- **Entry points**: where to start (main package, services, docs)
- **Pointers to depth**: `.agents/skills/`, `.agents/rules/`, `docs/` — one line each

Hard cap: **40 lines**. Target ~20. If content doesn't fit, it belongs elsewhere.

## 3. Route Content to the Right Place

| Content | Belongs in |
|---|---|
| Repo purpose, commands, entry points | AGENTS.md |
| Detailed instructions, workflows, conventions | `.agents/skills/`, `.agents/rules/`, `docs/` |
| Per-skill tables | only if the project commits to maintaining them — otherwise one pointer line to `.agents/skills/` |
| Long-form design docs | `docs/` |

Rule of thumb: if a line explains *how* or *why* in detail, move it out of AGENTS.md.

## 4. Compress

Apply [caveman-compression](../caveman-compression/SKILL.md) principles to every line — strip articles, auxiliary verbs, redundancy, pleasantries. Every line must earn its place. When in doubt, cut.

## 5. Validate

Run [GATES.md](GATES.md). Fix any failures before declaring done.

# Reference

- **Gates**: [GATES.md](GATES.md) (MUST READ)
- **Changelog**: [CHANGELOG.md](CHANGELOG.md)
- **Skill authoring**: [authoring-skills](../authoring-skills/SKILL.md)
- **Rules authoring**: [authoring-rules](../authoring-rules/SKILL.md)
- **Compression**: [caveman-compression](../caveman-compression/SKILL.md)
