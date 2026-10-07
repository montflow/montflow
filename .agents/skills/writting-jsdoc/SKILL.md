---
name: writting-jsdoc
description: >-
  Adds optional, ultra-minimal JSDoc to TypeScript code, only when explicitly asked —
  type information is never repeated. Use when the user asks to add or improve JSDoc
  documentation comments.
id: bf5631ed38f491b1
author: Daniel Montilla
version: 2.0.0
dependencies:
  - executing-skills
groups:
  - skills
  - typescript
  - javascript
  - documentation
---

# When To Use

Use only when the user explicitly asks to add, improve, or generate JSDoc. JSDoc is **not required** in this project — TypeScript signatures and Effect types are the documentation. When you do write it, keep it ultra-minimal.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Prefer No JSDoc

Do not add JSDoc unprompted. Prefer a clear exported name and an explicit type over a comment. Only annotate when the user asks, or when a non-obvious constraint genuinely cannot be expressed in the type.

## 2. Write the Shortest Comment

- One short **free-form** `/** ... */` line is the canonical form — this repo does not use `@description`.
- Never repeat type information: no `{Type}` braces, no return types, no error class names.
- Add `@param` / `@returns` / `@throws` only when the name or unit is genuinely non-obvious; `@throws` names no error type.
- `@example` only on explicit request.
- One line when possible; no trailing period on a single-line description.

## 3. Stop

Do not annotate every construct. A module's public surface gets at most the few comments a reader needs; everything else stays bare.

# Reference

| Annotation     | Use When                                              |
| -------------- | ----------------------------------------------------- |
| (free-form)    | Canonical — a single short line, no tag                |
| `@param`       | A parameter's meaning or unit is non-obvious           |
| `@returns`     | A return value's meaning is non-obvious                |
| `@throws`      | A failure is non-obvious — no error type name          |
| `@deprecated`  | Item is deprecated                                     |
| `@see`         | Cross-reference related items                          |
| `@example`     | Only when the user explicitly requests it              |
| `@description` | Not used in this repo                                  |

## Conventions

- Tags carry only names and prose — never types.
- Order when tags are used: `@param` → `@returns` → `@throws` → `@see` → `@deprecated`.
- Use imperative mood: "Creates a user", not "This function creates a user".

### Related

- **Structure entry point**: [montflow-typescript-project-structure](../montflow-typescript-project-structure/SKILL.md)
