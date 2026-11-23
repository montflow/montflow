---
name: opening-a-pr
description: "Open a ready pr from small ordered commits with a conventional commits title and a body that passes mf-mode pr check. invoked at the end of every other playbook."
---

# Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. Run `/deslop` from `cursor-team-kit` over the diff before commit.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing a reviewer reads at a glance. Start from `mf-mode pr template`: `## Summary`, `## What changed`, `## Decisions`, `## Proof`, `## Blast Radius`, `## Verification`, `## Follow-ups`, dropping the optional ones you have nothing for. Attach screenshots and report images with `mf-mode pr attach` and paste its lines under `## Proof`. Write the body to a file, run `mf-mode pr check --title <title> --body-file <file>`, fix every error, and act on each hint that applies before you publish.

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create` without `--draft`, or `origin pr create --status open` when Origin's CLI resolves the repository. Opening a PR does not start a babysit.
