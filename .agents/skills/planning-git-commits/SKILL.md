---
name: planning-git-commits
description: Creates a commit plan with conventional commits based on file paths. Use when the user wants to push or commit changes to git.
id: 508488c5515645f2
author: Daniel Montilla
version: 1.3.0
license: MIT
dependencies:
  - executing-skills
groups:
  - git
  - workflow
---

# When To Use

Use when the user asks to commit, push, or stage changes to git.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 0. Check Repository State

Before planning, run `git status --porcelain` and validate:

- **Merge conflicts**: If any files show `UU` status (unmerged), abort and tell the user to resolve conflicts before committing.
- **Detached HEAD**: If `git symbolic-ref -q HEAD` fails (detached HEAD), warn the user and confirm before proceeding.
- **Staged changes outside plan**: Check `git diff --cached --stat`. If pre-existing staged changes exist, warn the user and unstage them with `git restore --staged .` to avoid including unintended changes.
- **No changes**: If there are no changes (tracked, untracked, or staged), inform the user and stop.

## 1. Identify Files

If the user didn't specify which files to commit, ask which files should be included. Accept file paths, directories, or patterns.

## 2. Create Plan

Analyze the specified files and group them by:
- Package or app they belong to (for conventional commit scope)
- Logical grouping of related changes

### Commit Message Format

Use conventional commits with scope in parentheses derived from file paths:

| Type | Format | Example |
|------|--------|---------|
| Feature | `feat(scope): message` | `feat(web): add new component` |
| Fix | `fix(scope): message` | `fix(api): resolve endpoint error` |
| Chore | `chore(scope): message` | `chore(db): add migration` |
| Docs | `docs(scope): message` | `docs: update README` |
| Refactor | `refactor(scope): message` | `refactor(core): extract helper` |
| Test | `test(scope): message` | `test(api): add unit tests` |
| Style | `style(scope): message` | `style(web): format code` |
| Perf | `perf(scope): message` | `perf(db): optimize query` |
| Build | `build(scope): message` | `build(deps): upgrade effect` |
| CI | `ci(scope): message` | `ci: update workflow` |

Derive scope from file paths using these rules:

1. **Package/app directory**: If the path starts with `packages/<name>/`, `apps/<name>/`, `services/<name>/`, or `tools/<name>/`, use `<name>` as the scope. Example: `packages/api/src/index.ts` → `api`, `apps/web/pages/index.tsx` → `web`.
2. **Top-level directory**: For files not under a recognized prefix, use the top-level directory name. Example: `.github/workflows/ci.yml` → `ci`, `docs/architecture.md` → `docs`.
3. **Root files**: Files at the repository root (e.g., `turbo.json`, `package.json`, `README.md`) get no scope.
4. **Multiple scopes in one commit group**: If grouped files span multiple scopes, use the most common scope or no scope if evenly split.

### Message Quality

The commit message after the colon must be an imperative, present-tense description of what the change does (e.g., `add input validation`, not `added validation` or `fix`). Minimum 3 words, maximum 72 characters for the subject line.

### Breaking Changes

If a commit includes a breaking API or behavioral change, append `!` after the scope (e.g., `feat(api)!: drop v1 endpoint`). Optionally include a `BREAKING CHANGE:` footer describing the migration path.

## 3. Present Plan

Show the plan in this format:

```
## Commit Plan

### Commit 1: feat(api): add input validation
**Files:**
- packages/api/src/validators/input.ts
- packages/api/src/routes/validate.ts

### Commit 2: fix(web): correct button alignment
**Files:**
- apps/web/components/button.tsx
- apps/web/styles/button.css
```

Keep each commit focused on a single logical change. Large commits should be split and the user asked for approval.

Then ask for confirmation.

## 4. Execute After Confirmation

Wait for explicit user approval ("yes", "go ahead", "execute", "do it") before running git commands.

### Pre-flight Hook Check

Before staging or committing, determine whether the repository has git hooks:

```bash
git rev-parse --git-path hooks   # resolves the hooks dir (worktrees and bare repos included)
git config --get core.hooksPath  # set when a hook manager is active
```

Hooks are present when `core.hooksPath` is set, or the hooks directory contains executable files other than `*.sample`.

- **No hooks**: execute the plan normally. Do NOT pass `--no-verify` — there is nothing to bypass, so it is not part of this workflow.
- **Hooks present**: run the hooks against the current working tree **before** executing the plan, then execute the whole plan with `--no-verify`.

#### Run the Hooks

Invoke the hooks' own entry points rather than hand-rolled checks:

- Pre-commit hook: `git hook run pre-commit`.
- Hook manager: its run command, e.g. `lefthook run pre-commit` or `pre-commit run --all-files`.
- Pre-push hook: run the command it delegates to (e.g. the repo's `verify` script) directly — `pre-push` expects push arguments and is awkward to invoke standalone.

#### If the Hooks Pass

Execute the plan using `--no-verify` on every commit (`git commit --no-verify -m ...`). The tree already passed the hooks, so re-running them per commit is redundant.

#### If the Hooks Fail

1. Fix the issues. Apply mechanical fixes with the project's own tooling where possible (e.g. `format:fix`, `lint:fix`) instead of editing by hand.
2. Re-run the hooks until they pass.
3. Fold the fixes into the planned commit whose files they touch, or add a dedicated commit at the end when they don't fit an existing group.
4. Commit everything with `--no-verify`.

### Stage Files

Stage only the files from the plan using `git add -- <file1> <file2>`:
- The `--` separator prevents file paths from being interpreted as options.
- This handles both modified tracked files and new untracked files.
- Do NOT use `git add .` or `git add -A` as they would include changes not in the plan.

### Commit

Run `git commit -m '<subject>'` for single-line messages or `git commit -m '<subject>' -m '<body>'` for multi-line messages. Ensure the message is properly shell-escaped to prevent injection. Do NOT open an interactive editor — always use the `-m` flag.

When hooks are present and already passed the pre-flight check, add `--no-verify` to every commit. When no hooks are present, omit it.

### Error Handling

- If `git commit` fails (empty commit, staged conflicts, or a hook that was not bypassed), report the full error output to the user, show current `git status`, and ask how to proceed. Do NOT retry automatically.
- If a hook modifies files during a commit that was not bypassed, re-stage those changes and fold them into the plan before retrying.

## 5. Push (Optional)

After a successful commit, ask the user if they want to push. If yes:

1. Determine the remote and branch: run `git rev-parse --abbrev-ref @{upstream}` to get the upstream tracking branch. If no upstream is configured, default to `origin` and the current branch name from `git rev-parse --abbrev-ref HEAD`.
2. Confirm with the user before pushing, especially if the remote is shared.
3. Run `git push <remote> <branch>`.
4. If push fails (diverged history, rejected, auth failure), report the error output and ask the user how to proceed. Do NOT force-push without explicit user consent.

# Rules

- NEVER commit without explicit user confirmation
- NEVER amend pushed commits
- NEVER use `--author` flag or `Co-authored-by` trailers
- Before executing a plan, check for hooks and run them first when present — never execute the plan against an unverified tree
- Use `--no-verify` on every commit only when hooks are present and have passed the pre-flight check; when no hooks are present, do not use `--no-verify`
- On hook failure, apply mechanical fixes with the project's own tooling first, re-run the hooks until they pass, then fold the fixes into a planned commit or add one at the end
- Group files logically with descriptive messages
- Always use conventional commit format with appropriate scope
- Use `git add -- <file>` with the `--` separator to prevent path injection — never interpolate paths unsafely into shell commands
- Always stage files explicitly from the plan — never use wildcard `git add .` or `git add -A`
- On commit failure, report the error and ask the user — never retry automatically
- Use `git commit -m` with the `-m` flag to supply the message — never open an interactive editor
- On successful commit, ask the user if they want to push the changes before exiting

# Reference

- **Pre-flight checks**: see `## 0. Check Repository State`.
- **Hook pre-flight**: see `## 4. Execute After Confirmation` → `### Pre-flight Hook Check`.
- **Commit types and scope rules**: see `## 2. Create Plan`.
- **Executor skill**: [executing-skills](../executing-skills/SKILL.md).
