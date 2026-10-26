---
id: C001
name: scaffold-package-and-store
type: execution
originator: user
depends-on: B001, B002, B003
related-tasks:
status: complete
---

# Task C001: Scaffold the package and store

## Type: execution

## Description

Create `packages/references` with the utility-plugin manifest, source layout,
entry stubs, and test/typecheck wiring. No reference behaviour yet — this task
lands a package that installs, builds, exports, and is discovered by the packer.

## Requirements

- Add `packages/references/package.json`: name `@montflow/references`, private, description, keywords, license/author/repository, `bin.mf-references`, `exports` for `.`, `./server`, `./tui`, and the standard scripts (`cli`, `build:cli`, `generate:payload`, lint/format/test/ts:check).
- Add `tsconfig.json` and `vitest.config.ts` matching the sibling packages, and the dependency set the implementation needs (host packages external, `effect` peer/dev).
- Create `src/index.ts`, `src/modules/index.ts`, `src/apps/index.ts`, `src/server.ts`, and `src/tui.ts` with the same entry shape as `@montflow/skills`.
- Create the `src/modules` barrels for the reference entity, verifier, and git lifecycle, the `src/services/reference-store` barrel, and the CLI/doctor app barrels.
- Add `README.md` skeleton naming the store, clone root, CLI, plugin surfaces, and packaged skills.
- Register the workspace package with `bun install`; do not add a root script or CI cell yet.
- `bun run --cwd packages/references ts:check` and `test` pass with the stub tree.
- No file outside `packages/references/`, `bun.lock`, and `.agents/@montflow/specs/` is modified.

## Completion

- [ ] Package manifest, exports, tsconfig, and vitest config in place
- [ ] Entry stubs and module barrels compile
- [ ] `bun run pack:plugins` lists the new package
