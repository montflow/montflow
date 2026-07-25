---
name: finding-references
description: Finds, explores, and reports on third-party reference source code cloned into the project. Use when the user wants to examine reference code, find a specific reference package, or understand available reference dependencies.
id: e0b85938c06a1fe9
author: Daniel Montilla
version: 2.2.0
license: MIT
dependencies:
  - executing-skills
groups:
  - references
  - workflow
---

# When To Use

Use when the user wants to examine reference source code, find a specific reference package in the project, or understand what references are available.

> **Note**: References are stored as plain git clones under `.agents/references/` (gitignored). Previously they lived under `references/` as git submodules.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Identify Reference Request

Determine which reference or type of reference code the user needs based on their request.

## 2. Locate Reference

Search the `.agents/references/` directory for matching reference packages using Glob. Cross-reference with the Reference Registry in the Reference section below.

## 3. Clone Missing Reference (if needed)

If the requested reference is not found locally but exists in the Reference Registry:
1. Look up the URL from the Reference Registry table
2. Run: `mkdir -p .agents/references && touch .agents/references/.gitkeep`
3. Run: `git clone <url> .agents/references/<reference-name>`
4. Verify: `ls -R .agents/references/<reference-name>`

## 4. Present Information

For each matching reference, provide:
- **Path**: Location under `.agents/references/`
- **Purpose**: What the library does
- **URL**: Original source repository

## 5. Read Reference Code (if requested)

If the user wants to read or analyze reference source, navigate to the reference directory and read the relevant files.

# Reference

> **⚠️ References are READ ONLY.** They are plain git clones included for local reference and analysis only. They are **not** dependencies of the monorepo, its packages, services, or applications. Do not modify reference files or import from them in production code.

| Reference | Path | URL |
|-----------|------|-----|
| alchemy-effect | .agents/references/alchemy-effect | https://github.com/alchemy-run/alchemy-effect.git |
| drizzle-orm | .agents/references/drizzle-orm | https://github.com/drizzle-team/drizzle-orm |
| effect | .agents/references/effect | https://github.com/Effect-TS/effect-smol |
| orpc | .agents/references/orpc | https://github.com/middleapi/orpc.git |
| shadcn-svelte | .agents/references/shadcn-svelte | https://github.com/huntabyte/shadcn-svelte |
| sveltekit | .agents/references/sveltekit | https://github.com/sveltejs/kit.git |
| signoz | .agents/references/signoz | https://github.com/SigNoz/signoz |
| workers-oauth-provider | .agents/references/workers-oauth-provider | https://github.com/cloudflare/workers-oauth-provider |
| effect-cf | .agents/references/effect-cf | https://github.com/jbt95/effect-cf |
| vitest | .agents/references/vitest | https://github.com/vitest-dev/vitest |

To add a new reference, use `adding-references` skill.
