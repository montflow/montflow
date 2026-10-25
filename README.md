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
- `@montflow/workspace` — TUI dashboard route (grid, panels, detail views)

## Skills

```bash
npx skills add montflow/montflow --list
npx skills add montflow/montflow
```

## Sync skills

Skills come in two layers:

- **Portable** — language, docs, planning, skill-authoring, and TypeScript conventions. Safe to install anywhere.
- **Extension-bound** — only useful with the matching `@montflow/*` plugin. Skip unless that plugin is installed.

### Prompt: sync the right skills

```text
Add the montflow skills to this repo, matching the @montflow/* plugins it has.
Source: github.com/montflow/montflow.

1. List what's available: npx skills add montflow/montflow --list
2. Check which plugins are installed (opencode plugin list).
3. Install every portable skill, plus the skills for each installed plugin.
   These are the only extension-bound skills — omit the ones whose plugin is absent:

     @montflow/skills    -> montflow-create-pi-skills, montflow-modify-pi-skills
     @montflow/specs     -> montflow-create-pi-specs, montflow-find-pi-specs
     @montflow/profiles  -> montflow-create-pi-profiles, montflow-modify-pi-profiles
     @montflow/prompts   -> montflow-create-pi-prompts, montflow-execute-pi-prompts
     @montflow/reviews   -> montflow-adversarial-review, montflow-addressing-adversarial-review

4. Install with repeated -s, e.g.
   npx skills add montflow/montflow -s effect -s executing-skills ...
   Confirm with npx skills list.
```

### Prompt: montflow-ify the repo (everything)

```text
Turn this repo into a montflow workspace — all plugins, all skills, verified.
Source: github.com/montflow/montflow.

1. Clone it and install deps:
   git clone https://github.com/montflow/montflow ~/.montflow && cd ~/.montflow && bun install

2. Install every plugin project-locally:
   for p in skills specs profiles prompts reviews; do
     opencode plugin add ~/.montflow/packages/$p
   done
   opencode plugin add ~/.montflow/apps/workspace

3. Install all skills:
   npx skills add montflow/montflow -y

4. Doctor + verify against this repo:
   M=~/.montflow
   bun run --cwd "$M/packages/skills"   cli doctor --check --dir "$PWD" && bun run --cwd "$M/packages/skills"   cli verify --dir "$PWD"
   bun run --cwd "$M/packages/specs"    cli check --dir "$PWD" && bun run --cwd "$M/packages/specs"    cli doctor --check --dir "$PWD"
   bun run --cwd "$M/packages/prompts"  cli verify --all --dir "$PWD" && bun run --cwd "$M/packages/prompts"  cli doctor --check --dir "$PWD"
   bun run --cwd "$M/packages/profiles" cli verify --dir "$PWD"
   bun run --cwd "$M/packages/reviews"  cli verify --all --dir "$PWD" && bun run --cwd "$M/packages/reviews"  cli doctor --check --dir "$PWD"

5. Report what changed.
```

Updating later is the same dance — re-pull the clone, re-run the installs. See [INSTALL.md](./INSTALL.md) for flags and maintenance.
