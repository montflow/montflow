---
name: setup-typescript-package
description: Scaffolds TypeScript monorepo packages and services with consistent tooling, tsdown bundling, linting, formatting, and typechecking. Use when setting up a new package or service in a monorepo.
id: 6f46456868d6a664
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - executing-skills
groups:
  - typescript
  - scaffolding
---

# When To Use

Setting up a new package in `packages/` or a new service in `services/`. User asks to scaffold, initialize, or create a new TypeScript package, module, library, or service.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Gather Inputs

Collect before starting:

- **Target name**: npm package name (e.g., `@pokerbids/api-contract`)
- **Directory context**: `packages/` or `services/`
- **Dependencies** (packages only): Runtime deps for peerDependencies
- **Platform** (packages only): `neutral`, `node`, or `browser` (default `neutral`)
- **Extra externals** (packages only): Additional modules to externalize in tsdown
- **Scripts**: Any extra package.json scripts

## 2. Detect Context

Determine package vs service:

| Aspect | Package (`packages/`) | Service (`services/`) |
|--------|----------------------|----------------------|
| Build | tsdown | None (use `bun` directly) |
| DevDep `typescript` | Yes | No |
| DevDep `tsdown` | Yes | No |
| `tsconfig.build.json` | Yes | No |
| `tsdown.config.ts` | Yes | No |
| `files`, `main`, `types`, `exports` | Yes | No |

## 3. Create Common Files

Create directory, `src/index.ts`, `package.json`, `tsconfig.json`. Add shared devDependencies and scripts (`clean`, `lint`, `format`).

## 4. Configure Package (if `packages/`)

Add build tooling (`typescript`, `tsdown`), `tsconfig.build.json`, `tsdown.config.ts`, package entry fields (`files`, `main`, `types`, `exports`), peerDependencies, platform-specific export config.

## 5. Configure Service (if `services/`)

No build tooling — add runtime deps to `dependencies` directly. Set `outDir` in tsconfig.

## 6. Verify Setup

Run `lint:check`, `format:check`, `clean`. For packages also run `build` and `ts:check`.

# Reference

- **Detailed checklist**: See [CHECKLIST.md](CHECKLIST.md) (MUST READ) — authoritative item-by-item steps for every file and config value
- **Gates**: See [GATES.md](GATES.md) — end-of-process validation
