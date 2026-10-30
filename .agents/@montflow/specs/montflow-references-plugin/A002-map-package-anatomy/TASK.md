---
id: A002
name: map-package-anatomy
type: exploratory
originator: user
depends-on:
related-tasks:
status: complete
---

# Task A002: Map the utility-plugin anatomy

## Type: exploratory

## Description

Map the shape every `@montflow/*` utility plugin shares, using `@montflow/skills`,
`@montflow/profiles`, and `@montflow/reviews` as the models, so the references
package can be scaffolded without inventing structure. The package is
deterministic — git and store operations, no session dispatch — so identify the
smallest slice of the anatomy that still satisfies the CLI, plugin, doctor, and
verification standards.

## Requirements

- Record the package manifest contract: `private`, `bin`, `exports` (`.`, `./server`, `./tui`), scripts (`cli`, `build:cli`, `generate:payload`, lint/format/test/ts:check), dependencies, and the tsconfig/vitest files.
- Record the source layout: `src/index.ts`, `src/server.ts`, `src/tui.ts`, `src/modules/<entity>`, `src/modules/<entity>-store`, `src/services`, and the `src/apps/{cli,doctor}` split.
- Record the CLI layering: engines (structured in, data out), renderers (pure `data -> text`), `binary.apps.module.ts`, `slash.apps.module.ts`, `main.ts`, and the `exitFailed` / `--dir` / `--verbose` rules.
- Record each CLI's single-artifact scoped command (`cli <verb> <name> --dir $PWD`) and whether its README or CLI `CONTEXT.md` actually shows it.
- Record the plugin entry: `entry(ID, …)`, command registration, `defineTool`, `ServerPorts`, and how `exports./server` makes `bun run pack:plugins` discover the package.
- Record the payload pattern: `skills/`, `scripts/generate-embedded-skills.ts`, `src/apps/doctor/embedded-payload.generated.ts`, doctor install/freshness checks, and the drift test.
- Record the verification wiring: root `mf:check:<domain>` script, `mf:check` composition, CI matrix cell, AGENTS.md scope list, and the lefthook comment.
- Name the files to copy or adapt, and call out shared code (skill verification, payload generator) versus code that must stay local.
- No file outside `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Manifest, source layout, and CLI layering captured in MEMORY.md with file paths
- [ ] Plugin entry, pack discovery, and payload/doctor pattern captured
- [ ] Verification wiring and reuse/copy decisions recorded
