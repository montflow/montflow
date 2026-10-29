# montflow

TypeScript monorepo + agent skills. The extensions run as OpenCode server and
TUI plugins; the text stores and CLIs live in the same packages.

## Packages

- `@montflow/opencode` — adapter spine: ports, plugin entries, loader
- `@montflow/specs` — spec store, verifier, and the `mf-specs` CLI
- `@montflow/prompts` — prompt store, `mf-prompts` CLI, `prompt_inspect` / `prompt_execute` tools
- `@montflow/profiles` — profile store, `mf-profiles` CLI, `profile_execute` tool
- `@montflow/reviews` — review series format, `mf-reviews` CLI, `review_create` tool
- `@montflow/skills` — skill store, `mf-skills` CLI, `skill_create` / `skill_modify` tools
- `@montflow/model-fallback` — model fallback chains: owned `.agents` store, `mf-model-fallback` CLI, `/mf-fallback` dialogs, retry/resume fallback
- `@montflow/workspace` — TUI dashboard route (grid, panels, detail views)

## Skills

```bash
bun install
bun run --cwd packages/skills cli sync --source "$PWD" --target "$PWD"
```

`mf-skills sync` copies this repo's public skills from a checkout into
`<workspace>/.agents/skills/` — project-local, no npm and no network. `--source`
names the checkout, `--target` the workspace root (`--from` and `--dir` remain
back-compat aliases). Skills marked `metadata.internal: true` are skipped, never
copied.

Skills come in two layers: **portable** (language, docs, planning, TypeScript
conventions — safe anywhere) and **extension-bound** (only useful with the
matching `@montflow/*` plugin). OpenCode discovers `.agents/skills/` natively,
so in-repo skills need no install.

Install, flags, verification, and the `mf-*` CLIs:
[guides/installation.md](./guides/installation.md). Updating a checkout or an
installed store: [guides/updating.md](./guides/updating.md).
