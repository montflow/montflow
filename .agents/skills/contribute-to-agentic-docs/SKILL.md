---
name: contribute-to-agentic-docs
description: Authors and maintains how-to documentation in .agents/documentation/ written for agents, not humans — terse, compressed prose optimized for agent readability. Use when user asks to "add documentation entry", "document how an agent does X", or "write agent docs".
id: bab1bc6b1bde5abf
author: Daniel Montilla
version: 1.0.0
license: MIT
dependencies:
  - executing-skills
  - caveman-compression
groups:
  - documentation
---

# When To Use

Use when the user asks to create, edit, or review agent-facing how-to documentation — "add a documentation entry for doing X", "document how an agent does Y", "write agent docs for Z".

> **Scope**: Documentation here targets agents executing tasks in this repo. Human-facing documentation belongs in `wiki/` (see [contributing-to-wiki](../contributing-to-wiki/SKILL.md)). Skills belong in `.agents/skills/`.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline.

> **Prerequisite**: Load the [caveman-compression](../caveman-compression/SKILL.md) skill. All documentation prose follows its rules — agent readers need density, not prose.

# Pipeline

## 1. Categorize The Request

Classify what the user wants:

- **How-to** — procedure for accomplishing a task in this repo → this skill handles it
- **Skill** — repeatable workflow with trigger conditions → use [authoring-skills](../authoring-skills/SKILL.md) instead
- **Human doc** — explanation for human readers → use [contributing-to-wiki](../contributing-to-wiki/SKILL.md) instead

If ambiguous, ask the user.

## 2. Locate Existing Documentation

Check `.agents/documentation/` at repo root:

1. Create directory if missing.
2. List existing files. One how-to per file — never bundle unrelated procedures.
3. If a how-to for the same task exists, edit it instead of creating a near-duplicate. Merge overlapping steps.

## 3. Name The File

- Location: `.agents/documentation/`
- Format: kebab-case, verb-led, `<verb>-<object>.md`
- Examples: `run-tests.md`, `add-reference-package.md`, `rotate-api-keys.md`

## 4. Write Using The Template

```markdown
# <Verb> <Object>

<One line: what this achieves. No preamble.>

## When

<Conditions triggering this procedure. Compressed.>

## Steps

1. <Bounded action. Exact command or file path where relevant.>
2. <Bounded action.>
3. <Bounded action.>

## Verify

<Optional — command or check confirming success.>
```

Rules:

1. Apply [caveman-compression](../caveman-compression/SKILL.md) to all prose — remove articles, auxiliaries, scaffolding; keep nouns, verbs, numbers, negations, technical terms.
2. Imperative voice: "Run `bun install`", not "You should run" or "The install is run".
3. Numbered steps, one bounded action per step, exact commands inline as code.
4. No preamble ("This document describes..."), no recap closers, no rationale paragraphs. Rationale only when skipping it causes wrong action.
5. Cross-reference related how-tos by relative path: see [other-howto.md](./other-howto.md).
6. Reference skills by path when a step delegates to one: `.agents/skills/<name>/SKILL.md`.

## 5. Verify

1. File lives in `.agents/documentation/`, kebab-case verb-led name.
2. Follows template structure.
3. Every command and path in the doc exists or is created.
4. No near-duplicate of an existing how-to.
5. Prose passes caveman-compression: no articles, no auxiliaries where removable, meaning preserved.

# Reference

- [caveman-compression SKILL.md](../caveman-compression/SKILL.md): Compression rules (MUST READ)
