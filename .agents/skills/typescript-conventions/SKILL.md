---
name: typescript-conventions
description: >-
  Index of TypeScript-specific skills in this project — lists short descriptions and paths.
  Use when deciding which TypeScript skill applies, or as a reference map of available TS tooling.
id: 19088d58133341e3
author: Daniel Montilla
version: 1.2.1
license: MIT
groups:
  - typescript
dependencies:
  - executing-skills
  - applying-solid
  - effect-services
  - typescript-modules
  - effect-testing
  - effect-structs
  - typescript-file-structure
  - detecting-duplication
  - favoring-composition
  - leaving-it-cleaner
  - setup-typescript-package
  - effect-v4
  - simplifying-code
  - typescript-prefer-inference
  - writting-jsdoc
---

# When To Use

Use when the user's task involves TypeScript code. Also use as a quick-reference map of available TypeScript tooling in this project.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Identify the Task Category

Determine which category the user's request falls into:

- **Modules & Packages** — New reusable module or package scaffolding
- **Services & Structs** — New Effect service or branded struct
- **Testing** — Test setup and infrastructure
- **Coding Principles** — Refactoring, code review, or design improvement
- **Documentation** — Adding JSDoc

## 2. Browse the Index

Open the appropriate category table in [Reference](#reference) below and select the matching skill.

## 3. Load & Execute

Load the matched skill with the `skill` tool, then follow its Pipeline section end-to-end.

# Reference

## Modules & Packages

| Skill | Description |
|-------|-------------|
| [`typescript-modules`](../typescript-modules/SKILL.md) | Creates tree-shakable TypeScript modules with namespace-style exports, organized into group folders |
| [`typescript-file-structure`](../typescript-file-structure/SKILL.md) | Verifies TypeScript source tree structure — colocated tests, `.test.ts` naming, index.ts re-export chains |
| [`setup-typescript-package`](../setup-typescript-package/SKILL.md) | Scaffolds TypeScript monorepo packages and services with consistent tooling, bundling, linting, and formatting |

## Services & Structs

| Skill | Description |
|-------|-------------|
| [`effect-services`](../effect-services/SKILL.md) | Scaffolds Effect v4 services with ServiceMap.Service pattern inside the services/ group |
| [`effect-structs`](../effect-structs/SKILL.md) | Creates branded struct modules with validation, blueprint, and brand utilities inside the structs/ group |

## Testing

| Skill | Description |
|-------|-------------|
| [`effect-testing`](../effect-testing/SKILL.md) | TypeScript module tests — location, imports, suite naming, quality, and Effect runtime patterns |

## Coding Principles

| Skill | Description |
|-------|-------------|
| [`detecting-duplication`](../detecting-duplication/SKILL.md) | Scans for and refactors duplicated code, logic, and configuration |
| [`simplifying-code`](../simplifying-code/SKILL.md) | Audits code for over-engineering and unnecessary complexity |
| [`applying-solid`](../applying-solid/SKILL.md) | Reviews object-oriented code against all 5 SOLID principles |
| [`favoring-composition`](../favoring-composition/SKILL.md) | Identifies deep inheritance trees and replaces them with composition |
| [`leaving-it-cleaner`](../leaving-it-cleaner/SKILL.md) | Prompts incremental code hygiene improvements when touching files |
| [`typescript-prefer-inference`](../typescript-prefer-inference/SKILL.md) | Prefers TypeScript inference over explicit type annotations on variables and Effect pipelines |

## Documentation

| Skill | Description |
|-------|-------------|
| [`writting-jsdoc`](../writting-jsdoc/SKILL.md) | Generates concise JSDoc annotations for TypeScript functions, methods, interfaces, and classes |
