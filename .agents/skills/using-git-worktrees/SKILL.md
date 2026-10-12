---
name: using-git-worktrees
description: >-
  Ensures feature work runs in an isolated workspace via native tools or a git worktree
  fallback. Use when starting feature work that needs isolation from the current workspace,
  or before executing implementation plans.
id: f0a3ce02dd486fc5
author: montflow
version: 1.5.0
license: MIT
dependencies:
  - executing-skills
groups:
  - git
  - workflow
---

# When To Use

Use when starting feature work that needs isolation from the current workspace, or before executing implementation plans.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## Overview

Work happens in isolated workspace. Prefer platform native worktree tools. Fall back to manual git worktrees only when no native tool available.

**Core principle:** Detect existing isolation first. Use native tools. Fall back to git. Never fight harness.

**Announce at start:** "I'm using using-git-worktrees skill to set up isolated workspace."

## Step 0: Detect Existing Isolation

**Before creating anything, check if already in isolated workspace.**

```bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" 2>/dev/null && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" 2>/dev/null && pwd -P)
CURRENT_BRANCH=$(git branch --show-current)
```

**Submodule guard:** `GIT_DIR != GIT_COMMON` also true inside git submodules. Before concluding "already in a worktree," verify not in submodule:

```bash
# If returns path, in submodule, not worktree — treat as normal repo
git rev-parse --show-superproject-working-tree 2>/dev/null
```

**If `GIT_DIR != GIT_COMMON` (and not submodule):** Already in linked worktree.

**Exception (branch/location only — never nesting)**: A calling skill (e.g., an authoring skill) may request a specific branch name or worktree location. Honor that request **only when NOT already in a linked worktree**. If you are already in a linked worktree, do NOT create a nested worktree — the calling skill must author in the current (already isolated) workspace instead. The calling skill must delegate creation to this skill (Step 2); it must never run `git worktree add` directly.

**Otherwise**: Skip to Step 4. Do NOT create another worktree.

Report branch state:
- On branch: "Already in isolated workspace at `<path>` on branch `<name>`."
- Detached HEAD: "Already in isolated workspace at `<path>` (detached HEAD, externally managed). Branch creation needed at finish time."

**If `GIT_DIR == GIT_COMMON` (or in submodule):** In normal repo checkout.

Has user already indicated worktree preference in instructions? If not, ask consent:

> "Would you like me to set up an isolated worktree? It protects your current branch from changes."

Honor existing declared preference without asking. If user declines consent, work in place and skip to Step 4.

## Step 1: Gather Worktree Parameters

Before creating anything, establish four values. If the user (or a calling skill) already stated them, use those without asking. Otherwise **ask once, batched** — never create a worktree from guessed parameters.

| Parameter | Meaning | Notes |
|-----------|---------|-------|
| **Type** | Kind of work — sets the branch/folder prefix | Ask if unclear; suggest `feat` |
| **Name** | Short kebab-case slug | Ask |
| **Origin** | Branch the worktree is spawned from | Ask; never assume |
| **Push** | Whether to push the new branch to `origin` after creation | Ask |

**Type prefixes** — use the conventional-commit family:

| Prefix | Use for |
|--------|---------|
| `feat` | New feature |
| `fix` | Non-urgent bug fix |
| `hotfix` | Urgent production fix |
| `refactor` | Behavior-preserving restructuring |
| `chore` | Tooling, config, maintenance |
| `docs` | Documentation only |
| `test` | Tests only |
| `perf` | Performance work |

Honor an arbitrary prefix if the user names one.

**Derive the canonical values:**

```bash
PREFIX=feat                     # type prefix
NAME=my-feature                 # kebab-case slug
BRANCH="$PREFIX/$NAME"          # branch AND folder name, e.g. feat/my-feature
BASE=origin/main                # origin branch to spawn from
PUSH=true                       # push branch to origin after creation (true|false)
```

Validate before proceeding:
- `NAME` must be kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`).
- `BASE` must be an existing ref — confirm with `git rev-parse --verify "$BASE"`. If it is a remote branch, `git fetch` first so it is current.
- `BRANCH` must not already be an existing branch or worktree (`git worktree list`).

**Announce the plan:** "Creating `<BRANCH>` from `<BASE>`. Push to origin: yes/no." Then continue.

## Step 2: Create Isolated Workspace

**Two mechanisms. Try in this order.**

### 2a. Native Worktree Tools (preferred)

User asked for isolated workspace (Step 0 consent). Do you already have way to create worktree? Might be tool named `EnterWorktree`, `WorktreeCreate`, `/worktree` command, or `--worktree` flag. If so, use it and skip to Step 3 (push, if requested), then Step 4.

Native tools handle directory placement, branch creation, cleanup automatically. Pass the Step 1 parameters when the tool supports them: `BRANCH` as the branch name, `BASE` as the start point. If the tool cannot express the requested base branch, use the git fallback (2b) so the parameters are honored. Using `git worktree add` when native tool available creates phantom state harness cannot see or manage.

Only proceed to Step 2b if no native worktree tool available.

### 2b. Git Worktree Fallback

**Only use if Step 2a does not apply** — no native worktree tool available. Create worktree manually using git.

#### Directory Selection

Follow priority order. Explicit user preference always beats observed filesystem state.

1. **Check instructions for declared worktree directory preference.** If user specified one, set `WORKTREE_LOCATION` accordingly.

2. **Check for existing project-local worktree directory:**
   ```bash
   ls -d .worktrees 2>/dev/null     # Preferred (hidden)
   ls -d worktrees 2>/dev/null      # Alternative
   ```
   If found, use it. If both exist, `.worktrees` wins.

3. **If no other guidance**, default to `.worktrees/` at project root.

#### Safety Verification (project-local directories only)

**MUST verify directory ignored before creating worktree:**

```bash
git check-ignore -q .worktrees 2>/dev/null || git check-ignore -q worktrees 2>/dev/null
```

**If NOT ignored:** Add the chosen worktree directory (`.worktrees` if it exists or by default, otherwise `worktrees`, per Directory Selection above) to `.gitignore`, commit the change, then proceed.

**Why critical:** Prevents accidentally committing worktree contents to repository.

#### Create Worktree

```bash
# Determine location from directory selection logic above
if [ -n "$WORKTREE_LOCATION" ]; then
  LOCATION="$WORKTREE_LOCATION"
elif [ -d .worktrees ]; then
  LOCATION=".worktrees"
elif [ -d worktrees ]; then
  LOCATION="worktrees"
else
  LOCATION=".worktrees"
fi

# Determine branch name for new worktree
# Use the parameters gathered in Step 1 (PREFIX, NAME, BRANCH, BASE).
# BRANCH = "$PREFIX/$NAME" already carries the feature prefix, so
# feature-authoring workflows recognize the worktree.

path="$LOCATION/$BRANCH"
git worktree add "$path" -b "$BRANCH" "$BASE"
cd "$path"
```

**Sandbox fallback:** If `git worktree add` fails with permission error (sandbox denial), tell user sandbox blocked worktree creation, work in current directory instead. Then run setup and baseline tests in place.

## Step 3: Push Branch (optional)

Only if `PUSH=true` (Step 1). Skip otherwise.

```bash
git push -u origin "$BRANCH"
```

If push fails (no remote, auth, rejected), report the error and ask whether to continue locally without pushing. Do not block the rest of the pipeline — the worktree exists either way.

## Step 4: Project Setup

Initialize the worktree environment. If the agent does not already know the correct setup procedure, ask the user with a recommended option "let agent figure it out." If that option is chosen, explore project conventions (AGENTS.md, README.md, package.json, scripts/) to determine the correct setup command. Do not hardcode to any specific tool or package manager.

Typical patterns (may vary):
```bash
# Node.js / Bun
bun install / npm install / pnpm install

# Rust
cargo build

# Python
pip install -r requirements.txt / poetry install

# Go
go mod download
```

## Step 5: Verify Clean Baseline

Run tests to ensure workspace starts clean:

```bash
# Use project-appropriate command
npm test / cargo test / pytest / go test ./...
```

**If tests fail:** Report failures, ask whether to proceed or investigate.

**If tests pass:** Report ready.

### Report

```
Worktree ready at <full-path>
Tests passing (<N> tests, 0 failures)
Ready to implement <feature-name>
```

# Reference

## Quick Reference

| Situation | Action |
|-----------|--------|
| Already in linked worktree | Skip creation (Step 0) — never nest inside an existing worktree; calling skill may only request branch/location |
| In submodule | Treat as normal repo (Step 0 guard) |
| Parameters not stated | Ask once for type, name, origin, push (Step 1) — never guess |
| User declines worktree | Work in place, skip to Step 4 |
| Native worktree tool available | Use it (Step 2a) |
| No native tool | Git worktree fallback (Step 2b) |
| Push requested | `git push -u origin "$BRANCH"` (Step 3) |
| `.worktrees/` exists | Use it (verify ignored) |
| `worktrees/` exists | Use it (verify ignored) |
| Both exist | Use `.worktrees/` |
| Neither exists | Check instruction file, then default `.worktrees/` |
| Directory not ignored | Add to .gitignore + commit |
| Permission error on create | Sandbox fallback, work in place |
| Tests fail during baseline | Report failures + ask |
| No package.json/Cargo.toml | Skip dependency install |

## Common Mistakes

### Fighting harness

- **Problem:** Using `git worktree add` when platform already provides isolation
- **Fix:** Step 0 detects existing isolation. Step 2a defers to native tools.

### Guessing worktree parameters

- **Problem:** Branch name lacks a type prefix, or the worktree spawns from the wrong base — pollutes convention and history
- **Fix:** Gather type, name, origin, and push in Step 1; ask once, never guess

### Skipping detection

- **Problem:** Creating nested worktree inside existing one
- **Fix:** Always run Step 0 before creating anything

### Skipping ignore verification

- **Problem:** Worktree contents get tracked, pollute git status
- **Fix:** Always use `git check-ignore` before creating project-local worktree

### Assuming directory location

- **Problem:** Creates inconsistency, violates project conventions
- **Fix:** Follow priority: explicit instructions > existing project-local directory > default

### Proceeding with failing tests

- **Problem:** Cannot distinguish new bugs from pre-existing issues
- **Fix:** Report failures, get explicit permission to proceed

## Red Flags

**Never:**
- Create a nested worktree inside an existing linked worktree (Step 0 detects isolation — skip creation; calling skill may only request branch/location, never a new nested worktree)
- Use `git worktree add` when native worktree tool available (e.g., `EnterWorktree`). This is #1 mistake — use native tool if available.
- Skip Step 2a by jumping straight to Step 2b git commands
- Create a worktree without a resolved type, name, and origin (Step 1)
- Push the branch to origin unless the user asked for it (`PUSH=true`)
- Create worktree without verifying it is ignored (project-local)
- Skip baseline test verification
- Proceed with failing tests without asking

**Always:**
- Run Step 0 detection first
- Gather type, name, origin, and push before creating (Step 1)
- Prefer native tools over git fallback
- Follow directory priority: explicit instructions > existing project-local directory > default
- Verify directory ignored for project-local
- Auto-detect and run project setup
- Verify clean test baseline
