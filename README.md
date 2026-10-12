# montflow

TypeScript monorepo + agent skills.

## Packages

- `@montflow/core` — TypeScript utilities

## Skills

```bash
npx skills add montflow/montflow --list
npx skills add montflow/montflow -a pi
```

## Sync skills

Skills come in two layers:

- **Portable** — language, docs, planning, skill-authoring, and TypeScript conventions. Safe to install anywhere.
- **Extension-bound** — only useful with the matching `@montflow/pi-*` extension. Skip unless that extension is installed.

### Prompt: sync the right skills

```text
Add the montflow skills to this repo, matching the @montflow/pi-* extensions it has.
Source: github.com/montflow/montflow.

1. List what's available: npx skills add montflow/montflow --list
2. Check which extensions are installed (pi list, or .pi/settings.json).
3. Install every portable skill, plus the skills for each installed extension.
   These are the only extension-bound skills — omit the ones whose extension is absent:

     @montflow/pi-skills    -> montflow-create-pi-skills, montflow-modify-pi-skills
     @montflow/pi-specs     -> montflow-create-pi-specs, montflow-find-pi-specs
     @montflow/pi-profiles  -> montflow-create-pi-profiles, montflow-modify-pi-profiles
     @montflow/pi-prompts   -> montflow-create-pi-prompts, montflow-execute-pi-prompts
     @montflow/pi-runs      -> montflow-dispatch-pi-runs
     @montflow/pi-reviews   -> montflow-adversarial-review, montflow-addressing-adversarial-review

4. Install with repeated -s, e.g.
   npx skills add montflow/montflow -a pi -s effect -s executing-skills ...
   Confirm with npx skills list.
```

### Prompt: montflow-ify the repo (everything)

```text
Turn this repo into a montflow workspace — all extensions, all skills, verified.
Source: github.com/montflow/montflow.

1. Clone it and install deps:
   git clone https://github.com/montflow/montflow ~/.montflow && cd ~/.montflow && bun install

2. Install every extension project-locally:
   for p in pi-skills pi-specs pi-profiles pi-prompts pi-runs pi-reviews; do
     pi install ~/.montflow/packages/$p -l
   done

3. Install all skills:
   npx skills add montflow/montflow -a pi -y

4. Doctor + verify against this repo:
   M=~/.montflow
   bun run --cwd "$M/packages/pi-skills"   cli doctor       --dir "$PWD" && bun run --cwd "$M/packages/pi-skills"   cli verify --dir "$PWD"
   bun run --cwd "$M/packages/pi-prompts"  cli verify --all --dir "$PWD"
   bun run --cwd "$M/packages/pi-specs"    cli check        --dir "$PWD"
   bun run --cwd "$M/packages/pi-profiles" cli verify       --dir "$PWD"
   bun run --cwd "$M/packages/pi-runs"     cli doctor
   bun run --cwd "$M/packages/pi-reviews"  cli verify --all --dir "$PWD"

5. Report what changed.
```

Updating later is the same dance — re-pull the clone, re-run the installs. See [INSTALL.md](./INSTALL.md) for flags and maintenance.