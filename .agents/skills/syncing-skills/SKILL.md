---
name: syncing-skills
description: Syncs skills from this repo into a target project's .agents/skills/. Manages fresh syncs and updates with version comparison, changelog preservation, and parallel subagent orchestration. Use when the user wants to sync, update, or upgrade skills to another project.
id: 2eb6346337a80569
author: Daniel Montilla
version: 2.2.1
license: MIT
dependencies:
  - executing-skills
  - modifying-skills
groups:
  - skills
  - workflow
---

# When To Use

Use when the user wants to sync skills from this repository into a target project's `.agents/skills/` directory. Handles all, multi, or single skill syncs, including upgrades with version comparison, content diff detection, and changelog preservation.

**This skill runs FROM this repository, syncing TO a target project.**
- It is an **admin tool** — it should NEVER be installed into a target project itself.
- The `syncing-skills` skill is **always excluded** from any sync operation.
- If the target path is inside this repo, abort — no self-sync.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 0. Determine Mode

Before any context gathering, determine the sync mode:

- **all** — Sync every skill in `.agents/skills/` except `syncing-skills`
- **multi** — Sync specific named skills (user provides a list)
- **single** — Sync one named skill

If mode is ambiguous from the request, ask the user.

## 1. Gather Context

Now that mode is known, collect the full context:

### 1.1 Verify Source Location

Confirm we are running from the skills repository:

```bash
ls .agents/skills/syncing-skills/SKILL.md 2>/dev/null || { echo "Not in skills repo"; exit 1; }
```

List all available skills (filtering out `syncing-skills`):

```bash
ls -d .agents/skills/*/SKILL.md 2>/dev/null
```

### 1.2 Identify Target

Ask the user for the target project path (absolute or relative). If not provided, prompt:
> "What is the target project path to sync skills into?"

**Guard**: Resolve to absolute path. If target is inside this repo or points to the repo root, abort with:
> "Target is inside the skills repo. Skills cannot self-sync. Provide a different project path."

Before any destructive command below, the target MUST be validated. Insert this guard and ensure it precedes every `rm -rf`, `mkdir -p` into target, and `cp`:

```bash
: "${TARGET:?target path required}"
```

### 1.3 Select Skills

Based on mode:

- **all**: Use all skills from the available list, minus `syncing-skills`.
- **multi**: Validate user-provided names against available list. Warn if any don't exist. Strip `syncing-skills` from list if present.
- **single**: Validate the named skill exists. Reject `syncing-skills`.

### 1.4 Report Plan

Summarize to user:
> "Syncing <N> skills to <target>: <skill1>, <skill2>, ..."

Get confirmation before proceeding.

## 2. Pre-Sync Checklist (per skill)

For each skill, execute steps 2.1–2.5. In **multi** mode, delegate each skill to a parallel subagent (see §3.4). In **single** mode, execute inline.

### 2.1 Read Source Metadata

Read `<skill-name>/SKILL.md` frontmatter. Extract `version`, `dependencies`.

### 2.2 Check Existence in Target

Check `$TARGET/.agents/skills/<skill-name>/SKILL.md`:

- **Missing** → fresh sync (branch to §3.1)
- **Exists** → read target SKILL.md frontmatter, extract version

### 2.3 Version Resolution

Compare source version vs target version:

| Condition | Action |
|-----------|--------|
| Source == target, content matches (byte-level) | **Skip** — up-to-date |
| Source == target, content differs | Ask: "Versions match but content differs. 1) Overwrite 2) Keep local 3) Show diff" |
| Source > target | **Upgrade** (branch to §3.2) |
| Source < target | Ask: "Local `<skill>` at X.Y.Z, source at A.B.C (older). 1) Keep local 2) Downgrade 3) Merge manually" |
| Version unparseable (either side) | Treat as "content differs" — ask user |

Make the decision deterministic with concrete commands. Extract versions from each side's frontmatter, then byte-level compare content while excluding the CHANGELOG (so local changelog-only edits never force an overwrite):

```bash
: "${SRC:?source skills path required}"
: "${TARGET:?target path required}"

src_version="$(grep -m1 '^version:' "$SRC/<skill-name>/SKILL.md" | sed 's/version:[[:space:]]*//')"
tgt_version="$(grep -m1 '^version:' "$TARGET/.agents/skills/<skill-name>/SKILL.md" | sed 's/version:[[:space:]]*//')"

if [ "$src_version" = "$tgt_version" ] && \
   diff -r --exclude=CHANGELOG.md "$SRC/<skill-name>" "$TARGET/.agents/skills/<skill-name>" >/dev/null; then
  echo "up-to-date: skip"
else
  echo "version or content differs: prompt user"
fi
```

### 2.4 CHANGELOG Review

The target may not have a CHANGELOG.md (older syncs). Guard the read: only read and compare if the target file exists; otherwise treat it as "no local changelog entries".

```bash
: "${SRC:?source skills path required}"
: "${TARGET:?target path required}"

tgt_changelog="$TARGET/.agents/skills/<skill-name>/CHANGELOG.md"
if [ -f "$tgt_changelog" ]; then
  # compare "$tgt_changelog" with "$SRC/<skill-name>/CHANGELOG.md"
  echo "target changelog present: compare entries"
else
  echo "no local changelog: treat as no local entries"
fi
```

If target has entries not in source, ask:
> "Target CHANGELOG has local entries not in source. 1) Discard local 2) Append local to source's CHANGELOG 3) Merge manually"

### 2.5 Preserve Extra Files (optional)

If target has files not in source, list them and ask whether to keep. Default: source-only sync.

Record the answer as `KEEP_EXTRAS=yes` (preserve) or `KEEP_EXTRAS=no` (default) — this drives the branch in §3.2.

## 3. Sync

### 3.1 Fresh Sync

```bash
: "${TARGET:?target path required}"
: "${SRC:?source skills path required}"
mkdir -p "$TARGET/.agents/skills/<skill-name>"
cp -r "$SRC/<skill-name>/." "$TARGET/.agents/skills/<skill-name>/"
```

### 3.2 Upgrade (overwrite)

Branch on the §2.5 decision (whether to preserve target files not present in source):

- **Keep extras** (user chose to preserve in §2.5): do NOT `rm -rf`. Copy only source files into the target, leaving extras untouched — this is consistent with §2.5.
- **Do not keep extras** (default source-only sync): `rm -rf` the target skill dir, then re-create and copy source.

```bash
: "${TARGET:?target path required}"
: "${SRC:?source skills path required}"

if [ "${KEEP_EXTRAS:-no}" = "yes" ]; then
  mkdir -p "$TARGET/.agents/skills/<skill-name>"
  cp -r "$SRC/<skill-name>/." "$TARGET/.agents/skills/<skill-name>/"
else
  rm -rf "$TARGET/.agents/skills/<skill-name>"
  mkdir -p "$TARGET/.agents/skills/<skill-name>"
  cp -r "$SRC/<skill-name>/." "$TARGET/.agents/skills/<skill-name>/"
fi
```

Merge preserved changelog entries if user requested append in step 2.4 (prepend local entries to the fresh source copy).

### 3.3 Git Sparse Checkout (remote alternative)

If syncing from remote instead of local filesystem:

```bash
: "${TARGET:?target path required}"
(
  tmp="$(mktemp -d)"
  git clone --depth 1 --filter=blob:none --sparse https://github.com/montflow/montflow.git "$tmp"
  cd "$tmp"
  git sparse-checkout set ".agents/skills/<skill-name>"
  cp -r ".agents/skills/<skill-name>/." "$TARGET/.agents/skills/<skill-name>/"
  rm -rf "$tmp"
)
```

### 3.4 Subagent Orchestration (multi mode)

For **multi** mode, spawn independent subagents in parallel — one per skill. Each subagent receives:

- The **skill name** and **target path**
- Whether this is a **fresh sync** (follow §3.1) or **upgrade** (follow §3.2)
- Version comparison results from step 2.3
- Changelog merge instructions from step 2.4

```
task description: "sync <skill> to target"
prompt: "Sync skill '<skill-name>' to '$TARGET'.
  Source at: <path to source skill in this repo>.
  Sync type: fresh | upgrade.
  Steps: 2.1–2.5 then 3.1 or 3.2.
  Report back: synced/upgraded/skipped + version info."
subagent_type: general
```

Wait for all subagents to complete. Collect and aggregate their reports.

## 4. Post-Sync

### 4.1 Verify Each Skill

For each synced/upgraded skill:

- `$TARGET/.agents/skills/<skill-name>/SKILL.md` exists with valid frontmatter
- `version` in target matches expected version from source
- No missing files vs source directory listing

### 4.2 Update AGENTS.md in Target (Optional)

Ask the user whether the target project maintains a skill index in its root `AGENTS.md`. Registration is **optional** — per [setup-agentic-repo](../setup-agentic-repo/SKILL.md), AGENTS.md stays surface-level only and may skip per-skill tables entirely.

Only if the user confirms the target maintains a skill table: read SKILL.md frontmatter from all skills now in `$TARGET/.agents/skills/` and generate/replace the table at the **project root** `$TARGET/AGENTS.md` (table format below — this repo itself keeps AGENTS.md table-free per [setup-agentic-repo](../setup-agentic-repo/SKILL.md)):

| Skill | Description |
|-------|-------------|
| [<name>](.agents/skills/<name>/SKILL.md) | <description> |

**Exclude** `syncing-skills` from the table (it should not appear in target).

### 4.3 Report Summary

```
Synced:  <count>
Upgraded:   <count>
Skipped:    <count>
Errors:     <count>

Details:
  - <skill>: synced vX.Y.Z
  - <skill>: upgraded vA.B.C → vX.Y.Z
  - <skill>: skipped (up-to-date)
```

### 4.4 Offer Git Commit

If target is a git repo, ask:

> "Target is a git repo. Commit the skill changes? 1) Yes 2) No"

If yes:
```bash
git add .agents/skills/
git commit -m "feat: sync/update skills"
```

# Reference

- **Source repo**: `https://github.com/montflow/montflow` (branch `main`)
- **Skill authoring**: [authoring-skills](../authoring-skills/SKILL.md)
- **Skill modification**: [modifying-skills](../modifying-skills/SKILL.md)
- **Skill execution**: [executing-skills](../executing-skills/SKILL.md)
