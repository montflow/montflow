# INSTALL

Install skills from this repo into a target project `.agents/skills/`, or into any supported coding agent via `npx skills`.

- **Repo**: `https://github.com/montflow/montflow` (branch `main`)
- **Skills**: `.agents/skills/<skill-name>/` — discovered by both Pi and the `skills` CLI

## Quick Install (recommended): `npx skills`

The `skills` CLI (Vercel Labs, [skills.sh](https://skills.sh), `npm i skills`) installs skills to 70+ agents — including Pi, Claude Code, Codex, Cursor. No npm publish needed; it reads straight from git.

```bash
# List what's available
npx skills add montflow/montflow --list

# Install interactively to your detected agents
npx skills add montflow/montflow

# Pi only — global (~/.pi/agent/skills/) or project (.pi/skills/)
npx skills add montflow/montflow -a pi -g
npx skills add montflow/montflow -a pi

# Pick skills / agents non-interactively
npx skills add montflow/montflow -s authoring-skills -s grilling -a pi -y
npx skills add montflow/montflow --all

# One skill from a deep path
npx skills add https://github.com/montflow/montflow/tree/main/.agents/skills/authoring-skills
```

Maintenance: `npx skills list` (installed), `npx skills update [name]`, `npx skills remove [name]`, `npx skills find [query]`.

### Publishing

Skills are directories with a `SKILL.md` containing YAML frontmatter (`name`, `description` required — see [authoring-skills](.agents/skills/authoring-skills/SKILL.md)). `.agents/skills/` is a standard discovery location, so a plain `git push` to `main` is a release. Verify locally before pushing:

```bash
npx skills add ./ --list
```

### Pi integration

Pi auto-discovers `.agents/skills/` in `cwd` and ancestors (repo root), so in-repo skills are always live. Installing via `npx skills ... -a pi` makes them available in other projects or globally. Skills register as `/skill:name` commands. Format notes: Pi implements the [Agent Skills spec](https://agentskills.io/specification) and is lenient — unknown frontmatter fields are ignored; missing `description` is the only hard failure.

## OpenCode plugins (private)

The migrated plugins (`@montflow/specs`, `profiles`, `prompts`, `reviews`,
`skills`, `workspace`) are **private**: they are never published to npm. Install
them into an OpenCode v2 host by local path or by Git subpath.

```bash
# Local path (primary): loads the source tree as-is, no npm involved
opencode plugin add /path/to/montflow/packages/specs
opencode plugin add /path/to/montflow/apps/workspace

# Git subpath: reads a generated published-shape artifact, never the source manifest
bun run pack:plugins            # emits dist/pack/@montflow__<name>/
git add -f dist/pack && git commit -m "build: pack plugins" && git push
opencode plugin add "git+https://github.com/montflow/montflow.git#<sha>::path:dist/pack/@montflow__specs"
```

Why two forms: a committed source manifest declares `@montflow/*: workspace:*`,
which npm cannot resolve outside the monorepo, and its `exports` point at `.ts`
sources the packaged host does not load. `bun run pack:plugins` produces the
installable shape — prebuilt ESM bundles, host packages (`@opencode/*`,
`effect`, `@opentui/*`, `solid-js`) external, every `@montflow/*` dependency
bundled in, and no `workspace:` specifier. `dist/pack/**` is git-ignored; commit
it with `-f` on the release ref you pin.

`bun run verify:montflow:distribution` mechanically asserts both forms stay
wired: private + changeset-ignored, resolvable `exports`/`bin`, and an artifact
with no internal or `workspace:` dependency. No plugin is queued for public
publish — `.changeset/config.json` ignores every private package, and
`release.yml` skips private manifests.

## Alternative: syncing-skills skill

The **syncing-skills** skill is a guided installer: it reads the montflow/montflow repo's available skills, presents them for selection, and installs the chosen ones via `npx skills add`. It runs in any project (or globally) and works with any agent the skills CLI supports.

Load it via:

```
skill name: syncing-skills
```

It is marked `metadata.internal: true`, so the `skills` CLI **excludes it** from discovery, `--list`, and installs — `npx skills add montflow/montflow` installs the other 39 skills only. To force-install it anyway, name it explicitly (`-s syncing-skills`) or set `INSTALL_INTERNAL_SKILLS=1`.

See [.agents/skills/syncing-skills/SKILL.md](.agents/skills/syncing-skills/SKILL.md) for the pipeline.

## Quick Reference

| Topic | Instruction |
|-------|-------------|
| Install anywhere (any agent) | `npx skills add montflow/montflow` |
| Pi only | `npx skills add montflow/montflow -a pi` (+ `-g` for global) |
| List available skills | syncing-skills SKILL.md §1 |
| Present & select | syncing-skills SKILL.md §2 |
| Install | syncing-skills SKILL.md §3 |
| Verify | syncing-skills SKILL.md §4 |
| Maintenance | `npx skills list` / `update [name]` / `remove [name]` |