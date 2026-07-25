---
name: authoring-feature-spec-in-worktree
description: Authors a phased feature specification with workspace isolation via git worktrees. Wraps authoring-feature-spec with worktree creation, initialization, and relocation. Use when user wants to spec a new feature with an isolated git worktree.
id: 81d26538004b0249
author: Daniel Montilla
version: 1.1.0
license: MIT
dependencies:
  - authoring-feature-spec
  - using-git-worktrees
  - caveman-compression
  - grilling
  - finding-references
  - executing-skills
groups:
  - skills
  - feature-spec
  - planning
---

# When To Use

When a user asks to spec a new feature and the workspace needs isolation (git worktree). For in-place spec authoring without worktree isolation, use [authoring-feature-spec](../authoring-feature-spec/SKILL.md) directly.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Create Workspace

### Determine feature name

The worktree and branch names depend on the feature name. If the feature name is not already known (from context or user request):

1. Ask the user: "What is the feature name (kebab-case)?"
2. Use their answer as `<feature-name>` throughout this pipeline.

### Create isolation — delegate to `using-git-worktrees`

**Do NOT reimplement worktree logic.** Do NOT run `git worktree add` directly, and do NOT invent your own path/branch rules. All isolation logic — Step 0 detection (submodule guard, linked-worktree detection), native-tool preference, `.gitignore`/ignore verification, worktree creation, and relocation — lives in [using-git-worktrees](../using-git-worktrees/SKILL.md). Delegate to it.

1. Load `using-git-worktrees`.
2. It runs **Step 0 detection first**:
   - **Already in a linked worktree** (feature or non-feature, `GIT_DIR != GIT_COMMON`, not a submodule): do **NOT** create a nested worktree — that is forbidden and breaks harness tracking. Author **in place** in the current (already isolated) worktree. Set `workspace-type: worktree` and proceed to step 2. No relocation needed.
   - **In the main checkout** (`GIT_DIR == GIT_COMMON`) or **in a submodule**: proceed to create isolation.
3. To create the feature worktree, invoke `using-git-worktrees` Step 1 and **supply the branch name `feat/<feature-name>`** — when you reach `using-git-worktrees` Step 1b, set `BRANCH_NAME=feat/<feature-name>` explicitly (a loaded skill receives no `$1` argument, so do not rely on its `<branch>-worktree` default), or request the native tool to name the branch `feat/<feature-name>`. This keeps the branch convention consistent with `authoring-feature-spec` step 0, which recognizes a feature worktree by a `feat/` branch prefix — so an already-isolated worktree is never misclassified (fixes the `feat/<name>` vs `*-worktree` conflict).
4. Follow `using-git-worktrees` for project setup (Step 2) and clean-baseline verification (Step 3).

### Relocate

If `using-git-worktrees` created a new worktree, relocate into it (`cd "<path>"` or set tool workdir) **before** any context gathering or grilling — the worktree is the spec's home. All spec files will be created at `.agents/features/<feature-name>/` within it.

If authoring in place (already-isolated case above), skip relocation.

## 2. Author Spec

From this point, follow the [authoring-feature-spec](../authoring-feature-spec/SKILL.md) pipeline (skip its step 0 — isolation is already handled by `using-git-worktrees` above):

1. Gather Context — collect requirements, load grilling skill
2. Design Phases & Task Types
3. Design Gates
4. Generate Files
5. Review & Refine

All templates, frontmatter references, and file generation conventions are defined in the base skill.

# Reference

- **[authoring-feature-spec](../authoring-feature-spec/SKILL.md)** — Base skill for spec design, phases, gates, and file generation (MUST READ)
- **[authoring-feature-spec/templates/](../authoring-feature-spec/templates/)** — File templates: FEATURE.md, TASK.md, MEMORY.md, GATES.md (MUST READ)
- **[using-git-worktrees](../using-git-worktrees/SKILL.md)** — Worktree detection, creation, and setup
- **[executing-feature-spec](../executing-feature-spec/SKILL.md)** — Executor logic for task types and phase interruptions
