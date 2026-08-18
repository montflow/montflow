# INSTALL

Install skills from this repo into a target project `.agents/skills/`, or into any supported coding agent via `npx skills`.

- **Repo**: `https://github.com/DanielMontilla/ai` (branch `main`; `DanielMontilla/skills` redirects here)
- **Skills**: `.agents/skills/<skill-name>/` — discovered by both Pi and the `skills` CLI

## Quick Install (recommended): `npx skills`

The `skills` CLI (Vercel Labs, [skills.sh](https://skills.sh), `npm i skills`) installs skills to 70+ agents — including Pi, Claude Code, Codex, Cursor. No npm publish needed; it reads straight from git.

```bash
# List what's available
npx skills add DanielMontilla/ai --list

# Install interactively to your detected agents
npx skills add DanielMontilla/ai

# Pi only — global (~/.pi/agent/skills/) or project (.pi/skills/)
npx skills add DanielMontilla/ai -a pi -g
npx skills add DanielMontilla/ai -a pi

# Pick skills / agents non-interactively
npx skills add DanielMontilla/ai -s authoring-skills -s grilling -a pi -y
npx skills add DanielMontilla/ai --all

# One skill from a deep path
npx skills add https://github.com/DanielMontilla/ai/tree/main/.agents/skills/authoring-skills
```

Maintenance: `npx skills list` (installed), `npx skills update [name]`, `npx skills remove [name]`, `npx skills find [query]`.

### Publishing

Skills are directories with a `SKILL.md` containing YAML frontmatter (`name`, `description` required — see [authoring-skills](.agents/skills/authoring-skills/SKILL.md)). `.agents/skills/` is a standard discovery location, so a plain `git push` to `main` is a release. Verify locally before pushing:

```bash
npx skills add ./ --list
```

### Pi integration

Pi auto-discovers `.agents/skills/` in `cwd` and ancestors (repo root), so in-repo skills are always live. Installing via `npx skills ... -a pi` makes them available in other projects or globally. Skills register as `/skill:name` commands. Format notes: Pi implements the [Agent Skills spec](https://agentskills.io/specification) and is lenient — unknown frontmatter fields are ignored; missing `description` is the only hard failure.

## Alternative: syncing-skills skill

The **syncing-skills** skill copies skills into a target project's `.agents/skills/` with version comparison, changelog preservation, and parallel subagent orchestration. It is an admin tool that runs from this repo — never install it into a target.

Load it via:

```
skill name: syncing-skills
```

See [.agents/skills/syncing-skills/SKILL.md](.agents/skills/syncing-skills/SKILL.md) for the full pipeline.

## Quick Reference

| Topic | Instruction |
|-------|-------------|
| Install anywhere (any agent) | `npx skills add DanielMontilla/ai` |
| Pi only | `npx skills add DanielMontilla/ai -a pi` (+ `-g` for global) |
| Mode detection | syncing-skills SKILL.md §0 |
| Context & guardrails | syncing-skills SKILL.md §1 |
| Fresh install | syncing-skills SKILL.md §3.1 |
| Upgrade | syncing-skills SKILL.md §3.2 |
| Git sparse checkout | syncing-skills SKILL.md §3.3 |
| Multi-skill orchestration | syncing-skills SKILL.md §3.4 |
| Post-install + AGENTS.md (optional) | syncing-skills SKILL.md §4 |