# pi-profiles CLI — agent reference

Effect-first Pi extension owns agent profiles. Two commands, two audiences:

- `/mf-profiles` — interactive TUI (humans): browse, create, modify via dialogs, agentic runs.
- `/mf-profiles-cli` — headless, manual-only (agents/scripts): same operations as flags. **Use this one.**

## Invoking from bash

Slash commands **not** dispatched via `pi -p`. Drive CLI through RPC over stdio:

```bash
pi --mode rpc
```

Send one JSON line per command, read notify text from event stream:

```json
{"id": "req-1", "type": "prompt", "message": "/mf-profiles-cli list"}
```

Extension commands execute immediately, even mid-stream. Confirm via `{"type": "get_commands"}`
(`mf-profiles`, `mf-profiles-cli` listed when package loads).

## Storage

One directory per profile, one file per profile:

```text
.agents/@montflow/pi-profiles/<kebab-case-name>/PROFILE.md
```

`<name>` must match `^[a-z0-9]+(-[a-z0-9]+)*$`, else commands fail — slugify first
(lowercase, non-alphanumeric runs → single `-`, trim edge `-`).

## CLI reference

```text
/mf-profiles-cli list
/mf-profiles-cli show <name>
/mf-profiles-cli create <name> --description "text" [--model p/m] [--skills a,b] [--instructions "text"] [--checklist "item 1; item 2"]
/mf-profiles-cli modify <name> [--description ...] [--model ...] [--skills ...] [--instructions ...] [--checklist ...]
/mf-profiles-cli delete <name>
/mf-profiles-cli help
```

- Flags accept `--flag value`, `--flag=value`. Unknown flags print usage.
- `create` requires `--description`. Absent flags mean defaults (create), keep (modify).
  No clear-flags: blank field → `delete` + `create`.
- `--skills` comma-separated (`--skills reviewer,security`). `--checklist`
  **semicolon**-separated, items may contain commas.
- `delete` skips confirmation. `show`/`modify`/`delete` fail unknown names.

Examples:

```text
/mf-profiles-cli create code-reviewer --description "Senior reviewer focused on security" --instructions "Be strict. Cite files." --checklist "Security issues flagged; Tests cover changes"
/mf-profiles-cli modify code-reviewer --model anthropic/claude-sonnet-4-5 --skills authoring-profiles
/mf-profiles-cli show code-reviewer
```

## PROFILE.md schema (hand-written files)

Prefer CLI. Hand-writing `PROFILE.md` → match exactly what
`ProfileStore` parses — frontmatter plus `# Title` / `## Instructions` /
`## Review Checklist` body:

```markdown
---
name: <kebab-case-name>
description: <one line: role and job>
model: <provider/model-id, blank when unset>
skills:
  - <skill-name>
---

# <Display Title>

## Instructions

<system-prompt instructions>

## Review Checklist

- [ ] <verifiable item>
```

- `description` = WHAT agent is (role + job) — drives selection.
- `skills:` lists `SKILL.md` frontmatter `name:` values. List `.agents/skills/`,
  read each frontmatter `name:` first — reference existing skills only.
  Omit key when none.
- Keep at least one `- [ ]` checklist item. Never rename directory without
  updating `name:`.

## Standards

`.agents/skills/authoring-profiles/SKILL.md` (repo `montflow/montflow`,
installable via `npx skills add montflow/montflow -s authoring-profiles -a pi -y`)
holds authoring standards. Installed → follow it; rules above = mechanical core.
