---
name: adding-references
description: Adds and manages third-party reference source code as cloned git repositories. Use when the user wants to add reference source code for local reading or analysis.
id: e85e16a365fa6115
author: Daniel Montilla
version: 2.3.0
license: MIT
dependencies:
  - executing-skills
groups:
  - git
  - workflow
---

# When To Use

Use when the user asks to add reference source code, pull in third-party code for local reading, or analyze external codebases.

> **Note**: References live under `.agents/references/` as plain git clones (not submodules). This directory is gitignored. Previously, references were stored under `references/` as git submodules.

> **Prerequisite**: Load the [executing-skills](../executing-skills/SKILL.md) skill before running this pipeline. It governs how skills are loaded, executed, and verified.

# Pipeline

## 1. Pre-Execution Validation

1. **Git init**: run `git rev-parse --is-inside-work-tree`. If not a git repo, abort.
2. **Directory**: ensure at repository root.
3. **References directory**: ensure `.agents/references/` exists. Create it if missing:
   ```bash
   mkdir -p .agents/references && touch .agents/references/.gitkeep
   ```
4. **Gitignore**: ensure `.agents/references` is listed in `.gitignore`. If not, append it:
   ```bash
   echo ".agents/references" >> .gitignore
   ```

## 2. Install Reference

### Clone Repository

```bash
git clone <repo-url> .agents/references/<reference-name>
```

### Verify

```bash
ls -R .agents/references/<reference-name>
```

### Register Reference

Append the reference to `.agents/references/registry.md` — a local,
gitignored file that `mf-skills sync` never writes. Create it with its header
when missing:

```bash
REGISTRY=.agents/references/registry.md
[ -f "$REGISTRY" ] || printf '# Reference Registry\n\n| Reference | Path | URL |\n| --- | --- | --- |\n' > "$REGISTRY"
printf '| <reference-name> | .agents/references/<reference-name> | <repo-url> |\n' >> "$REGISTRY"
```

`finding-references` reads this overlay alongside its built-in table.

## 3. Maintain Reference

When user requests "update" or "latest version":

```bash
cd .agents/references/<reference-name> && git pull
```

## 4. Read-Only Guardrails

`.agents/references/` is gitignored, so reference files stay out of commits and PRs automatically.

If a user needs to ensure they don't accidentally modify reference files, remind them these are read-only snapshots for local analysis.

## 5. Recover from Modified Content

If local modifications need to be discarded:

```bash
cd .agents/references/<reference-name> && git reset --hard HEAD && cd -
```

# Reference

| Action | Command |
|--------|---------|
| Add reference | `git clone <url> .agents/references/<name>` |
| Verify | `ls -R .agents/references/<name>` |
| Register reference | Append a row to `.agents/references/registry.md` |
| Update to latest | `cd .agents/references/<name> && git pull` |
| Reset reference | `cd .agents/references/<name> && git reset --hard HEAD && cd -` |
