---
name: contributing-to-wiki
description: Authors and maintains wiki pages in wiki/ written for human readers — ADHD-friendly writing style, Mermaid diagrams where they clarify, and extensive cross-links between pages. Use when creating, editing, or reviewing files in wiki/.
id: 8d04af684bd11ff0
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
  - i-have-adhd
groups:
  - documentation
---

# When To Use

Use when the user asks to create, edit, or review a page in `wiki/`. Also applies when asked to "document X in the wiki", "add a wiki entry", or when moving existing documentation into `wiki/`.

> **Scope**: The wiki is written for humans, not agents. Every prose and structural decision below serves a human reader with limited attention. Agent-facing documentation does not belong in `wiki/` — it stays in `AGENTS.md`, `.agents/skills/`, and feature specs.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

> **Prerequisite**: Load the [i-have-adhd](../i-have-adhd/SKILL.md) skill. All wiki prose follows its rules — wiki readers are humans with limited attention.

# Pipeline

## 1. Locate or create the wiki

Check `wiki/` exists at the repo root. If missing, create it with an [index.md](../../../wiki/index.md) home page listing all other pages.

## 2. Load context before writing

1. Read [index.md](../../../wiki/index.md) to see what pages already exist.
2. Read 1–2 related pages to learn tone, structure, and heading conventions.
3. Identify every existing page the new content relates to — each one becomes a hyperlink target (see step 5).

## 3. Write ADHD-friendly prose

Apply every rule from [i-have-adhd](../i-have-adhd/SKILL.md) to wiki text:

1. First line of the page states what the reader will get or do.
2. Multi-step procedures are numbered lists; one bounded action per step.
3. Lists cap at 5 items; split into "must" vs "nice to have" beyond that.
4. No preamble ("This document describes..."), no recap closers.
5. Headers let skimmers jump straight to what they need.

## 4. Add diagrams where they clarify

Use fenced Mermaid blocks (` ```mermaid `). Add a diagram **when**:

- A flow has 3+ steps with branches → `flowchart`
- Components/services relate to each other → `flowchart` or `graph`
- State changes over time → `stateDiagram-v2`
- Events are sequenced → `sequenceDiagram`

Skip the diagram when a numbered list under 5 items says it as well. One diagram per concept — never re-draw the same flow twice across pages; link to the page that owns it instead.

## 5. Hyperlink extensively

Wiki pages form a graph, not a tree:

1. Use relative links: `[auth overview](./auth.md)`, not absolute paths or URLs.
2. Every page links to at least 2 related pages ("See also" section at minimum).
3. Link the first mention of any concept that has its own page — even mid-sentence.
4. Every new page gets linked *from* [index.md](../../../wiki/index.md).
5. When editing an existing page, add forward-links to newer pages it predates.

## 6. Verify

Before finishing, check every changed page:

1. Every relative link resolves to an existing file.
2. Every new page is linked from [index.md](../../../wiki/index.md).
3. Each page links to at least 2 related pages.
4. First mention of any concept that has its own page is hyperlinked.
5. First line of the page states what the reader gets or does — no "This document describes..." openers, no recap closers.
6. Every Mermaid block uses fenced ` ```mermaid ` syntax and renders without parse errors.

# Reference

- [i-have-adhd SKILL.md](../i-have-adhd/SKILL.md): Writing style rules (MUST READ)
