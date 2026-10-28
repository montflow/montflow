# mf-profiles CLI — agent reference

The profiles plugin owns agent profiles. Two ways in, over the same engines:

- `/mf-profiles <subcommand> …` — the slash command in the OpenCode host (humans and agents).
- `mf-profiles <subcommand> …` — the binary, for scripts.
- `profile_execute` — the agent tool that runs a stored profile on a native session.

## Invoking

From the OpenCode host, send the slash command as a prompt:

```text
/mf-profiles list
```

From a shell, run the binary from the package:

```bash
bun run --cwd packages/profiles cli list
```

Both forms read the same store and return the same report text.

## Storage

One directory per profile, one file per profile:

```text
.agents/@montflow/profiles/<kebab-case-name>/PROFILE.md
```

`<name>` must match `^[a-z0-9]+(-[a-z0-9]+)*$`, else commands fail — slugify first
(lowercase, non-alphanumeric runs → single `-`, trim edge `-`).

## CLI reference

```text
/mf-profiles list [--status valid|invalid]
/mf-profiles show <name>
/mf-profiles verify [<name>...]
/mf-profiles create <name> --description "text" [--model p/m] [--skills a,b] [--instructions "text"] [--checklist "item 1; item 2"]
/mf-profiles modify <name> [--description ...] [--model ...] [--skills ...] [--instructions ...] [--checklist ...]
/mf-profiles delete <name>
/mf-profiles help
```

- Flags accept `--flag value`, `--flag=value`. Unknown flags print usage.
- `list --status valid|invalid` keeps only profiles whose `PROFILE.md` passes
  (`valid`) or fails (`invalid`) mechanical verification; absent lists every profile.
- `verify [<name>...]` checks the `PROFILE.md` shape **and** every declared skill
  against `.agents/skills/`. Montflow skills (`montflow-*`) must satisfy the
  full skill standard; generic and vendored skills only have to exist. Name one
  or more profiles to narrow the check; omit names for the whole store. A named
  profile with no file is reported as `Profile not found.` Fails with the issue
  list when anything is off. The binary form is
  `mf-profiles verify [--all] [<name>...] [--dir <path>]`.
- On both, `--dir` is the **workspace root**; the store is
  `<root>/.agents/@montflow/profiles`.
- `create` requires `--description`. Absent flags mean defaults (create), keep (modify).
  No clear-flags: blank field → `delete` + `create`.
- `--skills` comma-separated (`--skills reviewer,security`). `--checklist`
  **semicolon**-separated, items may contain commas.
- `delete` skips confirmation. `show`/`modify`/`delete` fail unknown names.

Examples:

```text
/mf-profiles create code-reviewer --description "Senior reviewer focused on security" --instructions "Be strict. Cite files." --checklist "Security issues flagged; Tests cover changes"
/mf-profiles modify code-reviewer --model anthropic/claude-sonnet-4-5 --skills montflow-create-profiles
/mf-profiles show code-reviewer
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

`.agents/skills/montflow-create-profiles/SKILL.md` (repo `montflow/montflow`;
sync it from a checkout with
`bun run --cwd "$M/packages/skills" cli sync --source "$M" --target <root>` — see
`guides/installation.md`) holds authoring standards. Installed → follow it;
rules above = mechanical core.
