---
name: opening-a-pr
description: "Open a ready pr from small ordered commits with a conventional commits title and a body that passes mf-mode pr check. invoked at the end of every other playbook."
---

# Opening a PR

Invoked at the end of every other playbook.

Work from a git worktree off trunk, and keep unrelated work out of it. Rebase into small, landable commits. Run the **mf-mode-deslop** skill over the diff before commit.

Title: `type(scope): subject`, naming a real symbol when one carries the change. Body: a one-minute briefing a reviewer reads at a glance. Start from `mf-mode pr template`: `## Summary`, `## What changed`, `## Decisions`, `## Proof`, `## Blast Radius`, `## Verification`, `## Follow-ups`, dropping the optional ones you have nothing for. Attach screenshots and report images with `mf-mode pr attach` and paste its lines under `## Proof`. Write the body to a file, run `mf-mode pr check --title <title> --body-file <file>`, fix every error, and act on each hint that applies before you publish.

```bash
mf-mode pr template > <scratch>/pr-body.md                    # then fill in each section
mf-mode pr attach <shot.png> <report.png> <report.pdf>        # prints markdown: paste it under ## Proof
mf-mode pr check --title "<title>" --body-file <scratch>/pr-body.md
gh pr create --base <trunk> --title "<title>" --body-file <scratch>/pr-body.md
gh pr edit <number> --body-file <scratch>/pr-body.md          # a PR that is already open
```

`mf-mode pr attach` reads your token with `gh auth token` and the repository id with `gh api`, so `gh auth status` must pass. It also needs `curl`, and push access for a PDF, which goes to an orphan `assets/<branch>` branch while images go to GitHub's attachment store. Without the CLI, upload an image yourself and put the `url` it returns in the body as `![name](url)`:

```bash
RID=$(gh api repos/<owner>/<repo> --jq .id)
gh auth token | sed 's/^/Authorization: Bearer /' | curl -s -X POST --header @- -H "Accept: application/json" \
  --data-binary @<file>.png "https://uploads.github.com/user-attachments/assets?name=<file>.png&content_type=image/png&repository_id=$RID"
```

Stack follow-ups by base branch. Open PRs ready, through the run's PR tool with `draft: false`. Without one, use `gh pr create` without `--draft`, or `origin pr create --status open` when Origin's CLI resolves the repository. Opening a PR does not start a babysit.
