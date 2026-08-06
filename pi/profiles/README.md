# @montflow/profiles

A Pi extension that is a **pure profile store**. A profile is data — a one-line description (the agent's role and what it does), custom instructions, a review checklist, a preferred model, and a list of skills — nothing more.

Profiles live at `.agents/profiles/<name>/PROFILE.md`; the canonical structure is defined by the bundled **TEMPLATE.md** (copied into `.agents/profiles/TEMPLATE.md` on first use).

**This extension never executes anything.** No activation, no model switching, no prompt injection, no skill loading. It only creates / modifies / deletes / lists profiles, and serves profile context to **other extensions** over the event bus (see [Getting profile context](#getting-profile-context)). The one exception: in **agentic** create mode the extension hands your prompt to the main agent as a user message — the agent (not this extension) resolves the fields and runs the standalone CLI itself.

Built with **TypeScript + Effect v4** (`effect@beta`): file access, validation, and error handling run through Effect services (`FileSystem` / `Path` / `Schema`), and the standalone CLI runs via `NodeRuntime.runMain`.

## Two call modes

### Interactive mode

`/profiles` opens a **TUI menu**:

- **New profile** — pick **agentic** or **manual**:
  - *Agentic* — you give a simple prompt ("a security-focused code reviewer for our auth service"). The request is handed to the main agent, which asks you for anything unclear or vague, shows you the resolved profile, and only creates it after you approve — by running the standalone CLI with the resolved values.
  - *Manual* — step-by-step form: name → description → preferred model → skills multi-select → instructions → review checklist → preview in the editor → save.
- **Modify profile** — pick a profile, edit its raw PROFILE.md in the editor, save
- **Delete profile** — pick a profile, confirm, remove
- **List profiles** — pick a profile to view its content (read-only)

Agentic mode is TUI-only: it needs the main agent loop to take over.

### CLI mode

```bash
# inside pi
/profiles --list
/profiles --new --name code-reviewer --description "You are a senior code reviewer focused on security."
/profiles --show code-reviewer

# standalone (same parser, Effect core, prints to stdout)
node pi/profiles/cli.ts --list
node pi/profiles/cli.ts --new --name code-reviewer --description="You are a code reviewer" --skills="adversarial-review,unit-testing"
```

| Flag | Meaning |
|---|---|
| `--list` / `--ls` | List profiles |
| `--show <name>` | Show a PROFILE.md |
| `--modify <name>` / `--edit <name>` | Modify a profile (interactive, needs the TUI) |
| `--delete <name>` | Delete a profile (`--force` skips the confirm) |
| `--template` | Show TEMPLATE.md |
| `--new` | Create a profile (see below) |
| `--help` | Usage |

`--new` accepts `--name`, `--description`, `--model provider/model-id`, `--skills a,b,c`, `--instructions`, `--instructions-file <path>`, `--checklist "a|b"`, and `--force` (overwrite). Quoted values work in both space and `--flag=value` forms. Missing fields fall back to the interactive wizard when a UI is available.

## Profile structure

`.agents/profiles/<name>/PROFILE.md` (structure defined by `TEMPLATE.md`):

```markdown
---
name: code-reviewer
description: You are a senior code reviewer focused on security.
# Preferred model: provider/model-id (optional)
model: anthropic/claude-sonnet-4-5
# Skills this profile must load (names from SKILL.md frontmatter)
skills:
  - adversarial-review
  - unit-testing
---

# Code Reviewer

## Instructions

Review diffs aggressively. Assume the author made mistakes.

## Review Checklist

- [ ] No security holes
- [ ] Tests updated
```

- **Frontmatter** holds machine-readable metadata: `name`, `description`, optional `model`, and `skills` (canonical skill names from each `SKILL.md`'s frontmatter).
- **Body** holds the human-readable definition: `## Instructions` (custom system prompt) and `## Review Checklist` (items a reviewer must verify).

The `description` is the **single** description concept — it covers both who the agent is (its role) and what it does (the job), in one line. There is no separate purpose field. Legacy files created with a `## Purpose` section still parse: the purpose text folds into `description` when the frontmatter description is missing.

The fields are **data only** — other extensions decide what to do with them.

## Getting profile context

Consumers (other extensions) read profiles over the shared event bus. The API is typed in [`api.ts`](./api.ts) with client helpers:

```ts
import { getProfileViaBus, listProfilesViaBus } from '.../pi/profiles/api.ts';

// one profile, parsed
const result = await getProfileViaBus(pi, 'code-reviewer', ctx.cwd);
if (result.ok) {
  console.log(result.profile.description);
  console.log(result.profile.skills);      // skills the profile must load
  console.log(result.profile.instructions); // custom system-prompt text
} else {
  console.warn(result.error); // e.g. "Profile not found: code-reviewer"
}

// all profile names
const names = await listProfilesViaBus(pi, ctx.cwd);
```

Raw protocol (no import needed — works from any extension):

```ts
const id = crypto.randomUUID();
const unsubscribe = pi.events.on('profiles:get:result', (data) => {
  if ((data as { id: string }).id === id) {
    unsubscribe();
    // data: { id, ok: true, profile } | { id, ok: false, error }
  }
});
pi.events.emit('profiles:get', { id, name: 'code-reviewer', cwd: ctx.cwd });
```

Channels:

| Channel | Payload |
|---|---|
| `profiles:get` | `{ id, name, cwd }` |
| `profiles:get:result` | `{ id, ok, profile \| error }` |
| `profiles:list` | `{ id, cwd }` |
| `profiles:list:result` | `{ id, ok, names \| error }` |

Client helpers time out (5s default) with `{ ok: false, error }` when the profiles extension isn't loaded.

## Install

**Project-local** (loads when the project is trusted):

```bash
mkdir -p .pi/extensions
ln -s /path/to/skills/pi/profiles .pi/extensions/profiles
# or copy it there
```

**Global** (all projects):

```bash
ln -s /path/to/skills/pi/profiles ~/.pi/agent/extensions/profiles
```

Then restart pi (or `/reload`).

## Testing (interactive)

The interactive surfaces need a real TUI session:

1. `cd <project> && pi` (approve the trust prompt if asked)
2. `/profiles` → the four-item menu (new | modify | delete | list)
3. `/profiles --new` with no flags → the create wizard runs directly (agentic | manual choice first)
4. `/profiles --show <name>` → read-only view in the editor

Non-interactive sanity checks (no TUI needed):

```bash
node pi/profiles/cli.ts --list
node pi/profiles/cli.ts --new --name x --description="You are..." --skills="skill-a,skill-b"
pi -p "/profiles --bogus-flag"   # empty output = command registered & dispatched
```

## Development

```bash
npm install
npm run typecheck   # tsc --noEmit
npm test            # vitest (unit + event-bus API integration)
npm run cli -- --list   # standalone CLI (node cli.ts)
```

The standalone CLI runs on plain Node 24 (native TypeScript type stripping) — no tsx/loader required.

## Architecture

| Module | Role |
|---|---|
| `index.ts` | Pi extension entry: `/profiles` command dispatch (new/modify/delete/list/show) |
| `api.ts` | Inter-extension API: typed event-bus protocol (`profiles:get` / `profiles:list`), client helpers + server registration |
| `options.ts` | Flag parsing (quoted values, `--flag=value` + `--flag value`, bare booleans) into a tagged `ProfilesCommand` union |
| `model.ts` | `Profile` shape, Effect `Schema` validation, frontmatter/body parse + serialize, TEMPLATE placeholder rendering |
| `store.ts` | Effect `FileSystem`/`Path` CRUD for profiles |
| `skills.ts` | Discovers `.agents/skills/*/SKILL.md` (name + description from frontmatter) for the authoring wizard |
| `wizard.ts` / `menu.ts` | Interactive flows on Pi's `ctx.ui` (dialogs, editor, SelectList); agentic create hands the prompt to the main agent via `pi.sendUserMessage` |
| `runtime.ts` | `runStore`: runs `FileSystem | Path` effects with `NodeServices.layer` |
| `cli.ts` | Standalone CLI via `NodeRuntime.runMain` |
