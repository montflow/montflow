---
name: mf-setup
description: Installs, adds, repairs or checks montflow utilities in a repository with one script, `scripts/setup.ts` in the montflow checkout. Use when a repository needs montflow set up, a utility added, its installed stores repaired after an update, or a check that everything montflow installed is current.
id: 30125a047df1d374
author: montflow
version: 1.0.0
license: MIT
dependencies:
  - executing-skills
groups:
  - workflow
---

# When To Use

Use when montflow must be installed in a repository, a utility added to one that has it, its stores repaired after updating the checkout, or the whole install checked. Never install a utility by copying files or running its CLIs one by one: the script runs them in the right order and verifies each.

# Pipeline

## 1. Find the checkout

The checkout lives at `.agents/references/montflow` under the repository root, git-ignored. If it is missing, clone it there and install its dependencies, then continue:

```bash
git clone https://github.com/montflow/montflow.git .agents/references/montflow
bun install --cwd .agents/references/montflow --ignore-scripts
```

## 2. Run the script

From the repository root:

```bash
bun run .agents/references/montflow/scripts/setup.ts            # every utility
bun run .agents/references/montflow/scripts/setup.ts --only feature,principles,playbooks
bun run .agents/references/montflow/scripts/setup.ts --check    # write nothing; exit 1 when anything is missing or stale
```

Utilities: `skills`, `feature`, `profiles`, `prompts`, `principles`, `playbooks`, `reviews`, `references`, `model-fallback`. Without `--only`, all of them. Re-running is safe: every step is idempotent.

## 3. Read the report

One `step=… utility=… status=…` line per command, then `summary … failed=<n>`. A `failed` line prints the CLI's own output under it: fix what it names and run the script again. Do not work around a failed step.

## 4. Finish

- Commit `.gitignore` and the `.agents/` files the run wrote. Never commit `.agents/references/`.
- Tell the user they can choose a harness and model per role with `mf-feature roles set` (see the `mf-feature` package README), or leave every role on its default.

# Reference

- Skill execution: [executing-skills](../executing-skills/SKILL.md)
- The script: `.agents/references/montflow/scripts/setup.ts` (its header lists every step)
- The setup prompt for a repository with no montflow yet: the montflow README, "Setup prompt"
