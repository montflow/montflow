---
name: mimicking-conventions
description: Explores nearby files and analogous modules — same structural role, different domain — to learn project conventions before writing code. Use when creating or editing any file, module, or package to ensure new code looks like it belongs in the same codebase.
id: 97258220df9dc5c7
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - conventions
---

# When To Use

Before writing or editing any file, module, or package. Triggers: creating new code, adding a file to an existing module, scaffolding a new service/package/component, or any time code should blend into an established codebase.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Identify Structural Role

Name the role of the file or module about to be written. Roles are functional, not domain-specific.

Examples: `utils`, `service`, `repository`, `controller`, `middleware`, `types`, `constants`, `hooks`, `handlers`, `validators`, `config`, `tests`.

A file at `ledger/utils/format.ts` has role **utils**. A new service at `billing/InvoiceService` has role **service**.

## 2. Find Reference Modules

Use two discovery strategies together:

### 2.1 Proximity — Neighbors on Disk

Read files in the same directory and immediate parent/sibling directories. These share local conventions: naming, barrel files, co-location patterns, import style.

### 2.2 Analogy — Same Role, Different Domain

Search for modules with the **same structural role in a different domain**. Siblings by role, not by disk location.

- `ledger/utils` -> `common/utils`, `auth/utils`, `payments/utils`
- `billing/InvoiceService` -> `auth/AuthService`, `ledger/LedgerService`
- `src/components/Button/` -> `src/components/Modal/`, `src/components/Table/`

Prefer modules that are well-established (older, more references, more complete). Skip stubs, WIP, or generated code.

If no analogous module exists, rely on proximity neighbors alone.

## 3. Study Filesystem Layout

From both proximity neighbors and analogous modules, extract the on-disk conventions:

- Directory structure and nesting depth
- File naming (kebab-case, PascalCase, snake_case)
- Barrel files / index re-exports
- Co-located tests vs separate test directory
- Config file placement
- Asset or fixture organization

## 4. Study Internal Patterns

Read the actual code in both proximity neighbors and analogous files. Extract:

- Export style (named, default, namespace, barrel)
- Naming conventions (functions, types, variables, constants)
- Error handling (throw, Result, error codes, sentinel values)
- Dependency wiring (injection, imports, service locators)
- Function shape (params, return types, arity, currying)
- Composition style (inheritance, mixins, composition, pipelines)
- Comment and documentation density
- Import ordering and grouping

## 5. Mimic

Write code that is indistinguishable in style from the reference modules. A reader should not detect a different author.

When conventions conflict, prefer proximity neighbors over analogous modules, then closer domain over farther. When no convention exists, pick the simplest option and stay consistent within the file.

Never import patterns from outside the codebase unless the codebase already uses them.

# Reference
