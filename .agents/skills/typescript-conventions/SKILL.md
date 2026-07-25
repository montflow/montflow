---
name: typescript-conventions
description: Index of TypeScript-specific skills in this project — lists short descriptions and paths. Use when deciding which TypeScript skill applies, or as a reference map of available TS tooling.
id: 19088d58133341e3
author: Daniel Montilla
version: 1.1.0
license: MIT
groups:
  - typescript
dependencies:
  - executing-skills
  - applying-solid
  - creating-effect-services
  - creating-typescript-modules
  - creating-typescript-structs
  - detecting-duplication
  - favoring-composition
  - leaving-it-cleaner
  - scoping-features
  - setup-typescript-package
  - effect-unit-testing
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
| [`creating-typescript-modules`](../creating-typescript-modules/SKILL.md) | Creates tree-shakable TypeScript modules with namespace-style exports |
| [`setup-typescript-package`](../setup-typescript-package/SKILL.md) | Scaffolds TypeScript monorepo packages and services with consistent tooling, bundling, linting, and formatting |

## Services & Structs

| Skill | Description |
|-------|-------------|
| [`creating-effect-services`](../creating-effect-services/SKILL.md) | Scaffolds Effect v4 services with ServiceMap.Service pattern |
| [`creating-typescript-structs`](../creating-typescript-structs/SKILL.md) | Creates branded struct modules with validation, blueprint, and brand utilities |

## Testing

| Skill | Description |
|-------|-------------|
| [`unit-testing`](../unit-testing/SKILL.md) | Language-agnostic test quality fundamentals |
| [`typescript-unit-testing`](../typescript-unit-testing/SKILL.md) | TypeScript test infrastructure, directory structure, Vitest configuration |
| [`effect-unit-testing`](../effect-unit-testing/SKILL.md) | Effect-specific testing patterns for Effect v4 monorepo packages |

## Coding Principles

| Skill | Description |
|-------|-------------|
| [`detecting-duplication`](../detecting-duplication/SKILL.md) | Scans for and refactors duplicated code, logic, and configuration |
| [`simplifying-code`](../simplifying-code/SKILL.md) | Audits code for over-engineering and unnecessary complexity |
| [`scoping-features`](../scoping-features/SKILL.md) | Guides feature scoping to current requirements only |
| [`applying-solid`](../applying-solid/SKILL.md) | Reviews object-oriented code against all 5 SOLID principles |
| [`favoring-composition`](../favoring-composition/SKILL.md) | Identifies deep inheritance trees and replaces them with composition |
| [`leaving-it-cleaner`](../leaving-it-cleaner/SKILL.md) | Prompts incremental code hygiene improvements when touching files |
| [`typescript-prefer-inference`](../typescript-prefer-inference/SKILL.md) | Prefers TypeScript inference over explicit type annotations on variables and Effect pipelines |

## Documentation

| Skill | Description |
|-------|-------------|
| [`writting-jsdoc`](../writting-jsdoc/SKILL.md) | Generates concise JSDoc annotations for TypeScript functions, methods, interfaces, and classes |
